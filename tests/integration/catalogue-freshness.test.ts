import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Catalogue freshness: whatever changes what shoppers see refreshes the cached
// catalogue pages itself, and steps that change nothing shoppers see don't.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { revalidateTag } = await import("next/cache");
const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const { payments } = await import("@/lib/payments");
const { banUser, unbanUser } = await import("@/lib/account/ban");

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

async function fixture() {
  await db.$transaction([
    db.emailOutbox.deleteMany(),
    db.session.deleteMany(),
    db.review.deleteMany(),
    db.returnRequest.deleteMany(),
    db.orderEvent.deleteMany(),
    db.balanceEntry.deleteMany(),
    db.withdrawal.deleteMany(),
    db.order.deleteMany(),
    db.conditionReport.deleteMany(),
    db.listing.deleteMany(),
    db.sellerProfile.deleteMany(),
    db.auditLog.deleteMany(),
    db.user.deleteMany(),
  ]);
  const admin = await db.user.create({ data: { email: "a@test.dev", name: "Admin", role: "ADMIN", passwordHash: "x" } });
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Seller", passwordHash: "x" } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Buyer", passwordHash: "x" } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, slug: "s", displayName: "S" } });
  const listing = await db.listing.create({
    data: {
      slug: "item",
      sellerId: seller.id,
      title: "Test item",
      category: "phones",
      brand: "B",
      model: "M",
      description: "d",
      priceIdr: 10_000,
      shippingIdr: 500,
      conditionGrade: "GOOD",
      returnWindowDays: 7,
      status: "ACTIVE",
    },
  });
  return { admin, sellerUser, buyer, seller, listing };
}

/** Tags refreshed since the last check, and every refresh must make the next read wait for fresh data. */
function refreshed() {
  const calls = vi.mocked(revalidateTag).mock.calls;
  for (const [, profile] of calls) expect(profile).toEqual({ expire: 0 });
  const tags = calls.map(([tag]) => tag);
  vi.mocked(revalidateTag).mockClear();
  return tags;
}

describe("catalogue freshness", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  const listingPages = () => [`listing-${f.listing.id}`, `seller-${f.seller.id}`, "listings", "stats"];

  beforeEach(async () => {
    f = await fixture();
    vi.mocked(revalidateTag).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("takes the item off sale in the cached pages when the buyer starts paying, and puts it back when the hold runs out", async () => {
    vi.spyOn(payments, "checkout").mockResolvedValue({ redirectUrl: "https://pay.test/page" });
    vi.spyOn(payments, "abandon").mockResolvedValue({ state: "none" });
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    // Checking out alone doesn't take the item off sale.
    expect(refreshed()).toEqual([]);

    await orders.payOrder(orderId, f.buyer.id);
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("RESERVED");
    expect(refreshed()).toEqual(expect.arrayContaining(listingPages()));

    await db.order.update({ where: { id: orderId }, data: { reservedAt: new Date(Date.now() - 3_600_000) } });
    expect(await orders.expireUnpaidOrder(orderId)).toBe("expired");
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("ACTIVE");
    expect(refreshed()).toEqual(expect.arrayContaining(listingPages()));
  });

  it("leaves the cache alone when an order nobody was paying for closes", async () => {
    vi.spyOn(payments, "abandon").mockResolvedValue({ state: "none" });
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.cancelOrder(orderId, f.buyer.id, "");
    expect(refreshed()).toEqual([]);
  });

  it("refreshes on payment and completion, but not for shipping or confirming delivery", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    expect(refreshed()).toEqual(expect.arrayContaining(listingPages()));

    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE1");
    await orders.confirmDelivery(orderId, f.buyer.id);
    expect(refreshed()).toEqual([]);

    // Sold, the seller's sales count and the completed-orders number change.
    await orders.acceptOrder(orderId, f.buyer.id);
    expect(refreshed()).toEqual(expect.arrayContaining(listingPages()));

    // The seller's rating changes.
    await orders.leaveReview(orderId, f.buyer.id, 5, "");
    expect(refreshed()).toEqual(expect.arrayContaining([`seller-${f.seller.id}`, "listings"]));
  });

  it("refreshes when a returned item goes back to the seller", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE1");
    await orders.confirmDelivery(orderId, f.buyer.id);
    await orders.requestReturn(orderId, f.buyer.id, "DAMAGED", "Cracked screen on arrival");
    await orders.respondToReturn(orderId, f.sellerUser.id, true, "");
    await orders.shipReturn(orderId, f.buyer.id, "JNE", "RET1");
    refreshed();

    await orders.receiveReturn(orderId, f.sellerUser.id);
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("DRAFT");
    expect(refreshed()).toEqual(expect.arrayContaining(listingPages()));
  });

  it("hides and shows a banned seller's listings in the cached pages", async () => {
    await banUser(f.admin.id, f.sellerUser.id, { until: null, reason: "Selling fakes" });
    expect(refreshed()).toEqual(expect.arrayContaining([`seller-${f.seller.id}`, "listings", "stats"]));

    await unbanUser(f.admin.id, f.sellerUser.id);
    expect(refreshed()).toEqual(expect.arrayContaining([`seller-${f.seller.id}`, "listings", "stats"]));
  });

  it("leaves the cache alone when a buyer without listings is banned", async () => {
    await banUser(f.admin.id, f.buyer.id, { until: null, reason: "Payment abuse" });
    expect(refreshed()).toEqual([]);
  });
});
