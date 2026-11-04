import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const { banEnd, banUser, liftExpiredBans, unbanUser } = await import("@/lib/account/ban");
const { hashToken, validateSessionToken } = await import("@/lib/auth/session");
const { approveWithdrawal } = await import("@/lib/payouts/service");

const address = {
  fullName: "Test Buyer",
  phone: "+62 000 0000 000",
  line1: "Jl. Test 1",
  line2: "",
  city: "Jakarta",
  region: "",
  postalCode: "10110",
  country: "Indonesia",
};

const listingData = (sellerId: string, slug: string) => ({
  slug,
  sellerId,
  title: `Item ${slug}`,
  category: "phones",
  brand: "B",
  model: "M",
  description: "d",
  priceIdr: 10_000,
  shippingIdr: 500,
  conditionGrade: "GOOD",
  returnWindowDays: 7,
  status: "ACTIVE",
});

async function fixture() {
  await db.$transaction([
    db.emailOutbox.deleteMany(),
    db.session.deleteMany(),
    db.orderEvent.deleteMany(),
    db.balanceEntry.deleteMany(),
    db.withdrawal.deleteMany(),
    db.order.deleteMany(),
    db.listing.deleteMany(),
    db.sellerProfile.deleteMany(),
    db.auditLog.deleteMany(),
    db.user.deleteMany(),
  ]);
  const verified = { passwordHash: "x", emailVerifiedAt: new Date() };
  const admin = await db.user.create({ data: { email: "a@test.dev", name: "Admin", role: "ADMIN", ...verified } });
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Seller", ...verified } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Buyer", ...verified } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, slug: "s", displayName: "S" } });
  const sold = await db.listing.create({ data: listingData(seller.id, "sold") });
  const onSale = await db.listing.create({ data: listingData(seller.id, "on-sale") });
  const draft = await db.listing.create({ data: { ...listingData(seller.id, "draft"), status: "DRAFT" } });
  return { admin, sellerUser, buyer, seller, sold, onSale, draft };
}

async function signIn(userId: string) {
  const token = `${userId}`.padEnd(43, "x").slice(0, 43);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt: new Date(Date.now() + 86_400_000) } });
  return token;
}

const status = async (id: string) => (await db.listing.findUniqueOrThrow({ where: { id } })).status;

describe("banning an account", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("signs a banned seller out, hides their listings and refunds their unshipped orders", async () => {
    const token = await signIn(f.sellerUser.id);
    const { orderId } = await orders.createOrder(f.buyer.id, f.sold.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");

    const { cancelled } = await banUser(f.admin.id, f.sellerUser.id, { until: null, reason: "Selling fakes" });

    expect(cancelled).toBe(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { events: true } });
    expect(order.status).toBe("CANCELLED");
    expect(order.refundIdr).toBe(order.totalIdr);
    expect(order.events.find((e) => e.type === "CANCELLED")?.message).toBe("Order cancelled by ReGear. The buyer gets a full refund.");
    // Both items are hidden, including the one the cancelled order put back on sale; drafts are left alone.
    expect(await status(f.sold.id)).toBe("SUSPENDED");
    expect(await status(f.onSale.id)).toBe("SUSPENDED");
    expect(await status(f.draft.id)).toBe("DRAFT");
    expect(await db.session.count({ where: { userId: f.sellerUser.id } })).toBe(0);
    expect(await validateSessionToken(token)).toBeNull();
    // Told by email; the buyer hears about the cancellation.
    const emails = await db.emailOutbox.findMany({ select: { userId: true, template: true } });
    expect(emails).toContainEqual({ userId: f.sellerUser.id, template: "account-banned" });
    expect(emails).toContainEqual({ userId: f.buyer.id, template: "order-event" });
    // New orders can't be placed on the hidden items.
    await expect(orders.createOrder(f.buyer.id, f.onSale.id, address)).rejects.toThrow();
  });

  it("releases a banned buyer's unpaid orders but lets paid ones carry on", async () => {
    const unpaid = await orders.createOrder(f.buyer.id, f.sold.id, address);
    const paid = await orders.createOrder(f.buyer.id, f.onSale.id, address);
    await orders.payOrder(paid.orderId, f.buyer.id);

    await banUser(f.admin.id, f.buyer.id, { until: new Date(Date.now() + 86_400_000), reason: "Payment abuse" });

    expect((await db.order.findUniqueOrThrow({ where: { id: unpaid.orderId } })).status).toBe("CANCELLED");
    expect((await db.order.findUniqueOrThrow({ where: { id: paid.orderId } })).status).toBe("PAID");
    expect(await status(f.sold.id)).toBe("ACTIVE");
  });

  it("lifting a ban puts the listings back on sale; a lapsed ban stops counting at once", async () => {
    await banUser(f.admin.id, f.sellerUser.id, { until: new Date(Date.now() + 60_000), reason: "Cooling off" });
    expect(await status(f.onSale.id)).toBe("SUSPENDED");
    // Removed by an admin while banned: stays removed.
    await db.listing.update({ where: { id: f.sold.id }, data: { status: "REMOVED" } });

    // Two minutes on, the ban has run out, though the job hasn't lifted it yet.
    const later = new Date(Date.now() + 120_000);
    const token = await signIn(f.sellerUser.id);
    vi.useFakeTimers({ now: later, toFake: ["Date"] });
    try {
      expect(await validateSessionToken(token)).not.toBeNull();
      expect((await liftExpiredBans(later)).lifted).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    expect(await status(f.onSale.id)).toBe("ACTIVE");
    expect(await status(f.sold.id)).toBe("REMOVED");
    expect((await db.user.findUniqueOrThrow({ where: { id: f.sellerUser.id } })).bannedAt).toBeNull();
    expect(await db.emailOutbox.count({ where: { template: "account-unbanned" } })).toBe(1);
    await expect(unbanUser(f.admin.id, f.sellerUser.id)).rejects.toThrow(/isn't banned/);
  });

  it("changing a ban's length keeps when it started", async () => {
    await banUser(f.admin.id, f.buyer.id, { until: new Date(Date.now() + 86_400_000), reason: "First warning" });
    const first = await db.user.findUniqueOrThrow({ where: { id: f.buyer.id } });
    await banUser(f.admin.id, f.buyer.id, { until: null, reason: "Did it again" });
    const second = await db.user.findUniqueOrThrow({ where: { id: f.buyer.id } });
    expect(second.bannedAt).toEqual(first.bannedAt);
    expect(second.bannedUntil).toBeNull();
    expect(second.banReason).toBe("Did it again");
  });

  it("refuses admins, deleted accounts and end dates in the past", async () => {
    await expect(banUser(f.admin.id, f.admin.id, { until: null, reason: "Nope nope" })).rejects.toThrow(/Admin accounts can't be banned/);
    await expect(banUser(f.admin.id, f.buyer.id, { until: new Date(Date.now() - 1000), reason: "Too late" })).rejects.toThrow(/future/);
    await db.user.update({ where: { id: f.buyer.id }, data: { deletedAt: new Date() } });
    await expect(banUser(f.admin.id, f.buyer.id, { until: null, reason: "Already gone" })).rejects.toThrow(/can't be banned/);
  });

  it("holds a banned seller's withdrawals", async () => {
    const w = await db.withdrawal.create({
      data: { sellerId: f.seller.id, amountIdr: 50_000, bank: "bca", accountNumber: "1234567890", accountName: "Seller", status: "PENDING_REVIEW" },
    });
    await banUser(f.admin.id, f.sellerUser.id, { until: null, reason: "Selling fakes" });
    await expect(approveWithdrawal(w.id, f.admin.id)).rejects.toThrow(/Payouts to them wait/);
    expect((await db.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("PENDING_REVIEW");
  });

  it("works out when a ban chosen in the form ends", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    expect(banEnd("7", "", now)).toEqual(new Date("2026-11-11T10:00:00Z"));
    expect(banEnd("permanent", "", now)).toBeNull();
    // A chosen date ends at the start of that day in Jakarta.
    expect(banEnd("custom", "2026-12-01", now)).toEqual(new Date("2026-11-30T17:00:00Z"));
    expect(() => banEnd("custom", "not a date", now)).toThrow();
  });
});
