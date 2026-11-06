import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const { markDisputeUnderReview, postDisputeMessage } = await import("@/lib/orders/disputes");

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
    db.disputeMessage.deleteMany(),
    db.dispute.deleteMany(),
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
  const admin = await db.user.create({ data: { email: "a@test.dev", name: "Admin", role: "ADMIN", passwordHash: "x", emailVerifiedAt: new Date() } });
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Seller", passwordHash: "x", emailVerifiedAt: new Date() } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Buyer", passwordHash: "x", emailVerifiedAt: new Date() } });
  const stranger = await db.user.create({ data: { email: "x@test.dev", name: "Stranger", passwordHash: "x", emailVerifiedAt: new Date() } });
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
  const { orderId } = await orders.createOrder(buyer.id, listing.id, address);
  await orders.payOrder(orderId, buyer.id);
  const { disputeId } = await orders.openDispute(orderId, buyer.id, "NOT_RECEIVED", "It never arrived at my address.");
  await db.emailOutbox.deleteMany();
  return { admin, sellerUser, buyer, stranger, orderId, disputeId };
}

/** Who was emailed about a new dispute message since the last check. */
async function notified() {
  const rows = await db.emailOutbox.findMany({ where: { template: "dispute-message" }, select: { userId: true } });
  await db.emailOutbox.deleteMany();
  return rows.map((r) => r.userId).sort();
}
const auditCount = (action: string) => db.auditLog.count({ where: { action } });

describe("disputes", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("lets the buyer, the seller and an admin write, and emails everyone else", async () => {
    expect(await postDisputeMessage(f.disputeId, { id: f.buyer.id, role: "USER" }, "Any update?")).toEqual({ ok: true });
    expect(await notified()).toEqual([f.sellerUser.id]);

    expect(await postDisputeMessage(f.disputeId, { id: f.sellerUser.id, role: "USER" }, "I shipped it on Monday.")).toEqual({ ok: true });
    expect(await notified()).toEqual([f.buyer.id]);

    expect(await postDisputeMessage(f.disputeId, { id: f.admin.id, role: "ADMIN" }, "Checking with the courier.")).toEqual({ ok: true });
    expect(await notified()).toEqual([f.buyer.id, f.sellerUser.id].sort());

    const roles = (await db.disputeMessage.findMany({ where: { disputeId: f.disputeId }, orderBy: { createdAt: "asc" }, select: { authorRole: true } })).map((m) => m.authorRole);
    // The first message is the description the buyer opened the dispute with.
    expect(roles).toEqual(["BUYER", "BUYER", "SELLER", "ADMIN"]);
  });

  it("tells a stranger the dispute doesn't exist, and closes the conversation once it's resolved", async () => {
    expect(await postDisputeMessage(f.disputeId, { id: f.stranger.id, role: "USER" }, "Hello?")).toEqual({ ok: false, reason: "notFound" });
    expect(await postDisputeMessage("nosuchdisputeid000000000", { id: f.buyer.id, role: "USER" }, "Hello?")).toEqual({ ok: false, reason: "notFound" });

    await orders.resolveDispute(f.disputeId, f.admin.id, "REFUND_BUYER", "Courier lost the parcel.");
    expect(await postDisputeMessage(f.disputeId, { id: f.buyer.id, role: "USER" }, "Thanks!")).toEqual({ ok: false, reason: "closed" });
    expect(await db.disputeMessage.count({ where: { disputeId: f.disputeId, authorId: f.stranger.id } })).toBe(0);
  });

  it("takes up an open dispute once, telling both sides", async () => {
    expect(await markDisputeUnderReview(f.disputeId, f.admin.id)).toBe(true);
    expect((await db.dispute.findUniqueOrThrow({ where: { id: f.disputeId } })).status).toBe("UNDER_REVIEW");
    expect(await notified()).toEqual([f.buyer.id, f.sellerUser.id].sort());

    // A second admin (or a double click) changes nothing and posts nothing.
    expect(await markDisputeUnderReview(f.disputeId, f.admin.id)).toBe(false);
    expect(await notified()).toEqual([]);
    expect(await db.disputeMessage.count({ where: { disputeId: f.disputeId, authorRole: "ADMIN" } })).toBe(1);
  });

  it("records each step in the audit log exactly once", async () => {
    expect(await auditCount("dispute.open")).toBe(1);
    await markDisputeUnderReview(f.disputeId, f.admin.id);
    await markDisputeUnderReview(f.disputeId, f.admin.id);
    expect(await auditCount("dispute.review")).toBe(1);
    await orders.resolveDispute(f.disputeId, f.admin.id, "PARTIAL_REFUND", "Partly damaged.", 2_000);
    expect(await auditCount("dispute.resolve")).toBe(1);
    const meta = JSON.parse((await db.auditLog.findFirstOrThrow({ where: { action: "dispute.resolve" } })).meta);
    expect(meta).toEqual({ resolution: "PARTIAL_REFUND", refundIdr: 2_000 });
  });
});
