import { beforeEach, describe, expect, it, vi } from "vitest";

// IDOR guard: knowing an order's or dispute's id must not let anyone else read
// or change it. Strangers get the same "not found" as for an id that doesn't exist.

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const { getDisputeForUser, getOrderForUser } = await import("@/lib/data/orders");

const address = { fullName: "Test Buyer", phone: "+62 811 0000 000", line1: "Jl. Test 1", line2: "", city: "Jakarta", region: "", postalCode: "10110", country: "Indonesia" };
const asUser = (u: { id: string; email: string; name: string; role: string }) => ({ ...u, emailVerified: true, sessionExpiresAt: new Date(Date.now() + 86_400_000) });

async function fixture() {
  await db.$transaction([
    db.emailOutbox.deleteMany(),
    db.disputeMessage.deleteMany(),
    db.dispute.deleteMany(),
    db.review.deleteMany(),
    db.returnRequest.deleteMany(),
    db.orderEvent.deleteMany(),
    db.order.deleteMany(),
    db.conditionReport.deleteMany(),
    db.listing.deleteMany(),
    db.sellerProfile.deleteMany(),
    db.session.deleteMany(),
    db.user.deleteMany(),
  ]);
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Seller", passwordHash: "x" } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Buyer", passwordHash: "x" } });
  // A stranger who is also a seller, so seller-side checks are exercised too.
  const strangerUser = await db.user.create({ data: { email: "x@test.dev", name: "Stranger", passwordHash: "x" } });
  await db.sellerProfile.create({ data: { userId: strangerUser.id, slug: "x", displayName: "X" } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, slug: "s", displayName: "S" } });
  const listing = await db.listing.create({
    data: { slug: "item", sellerId: seller.id, title: "Item", category: "phones", brand: "B", model: "M", description: "d", priceIdr: 10_000, conditionGrade: "GOOD", returnWindowDays: 7, status: "ACTIVE" },
  });
  return { sellerUser, buyer, strangerUser, listing };
}

describe("someone else's order", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("can't be read, by order id or dispute id", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    await orders.confirmDelivery(orderId, f.buyer.id);
    const { disputeId } = await orders.openDispute(orderId, f.buyer.id, "NOT_AS_DESCRIBED", "The screen has a crack that the condition report didn't mention.");

    const stranger = asUser(f.strangerUser);
    expect(await getOrderForUser(orderId, stranger)).toBeNull();
    expect(await getDisputeForUser(disputeId, stranger)).toBeNull();
    // The parties themselves still can.
    expect((await getOrderForUser(orderId, asUser(f.buyer)))?.role).toBe("BUYER");
    expect((await getOrderForUser(orderId, asUser(f.sellerUser)))?.role).toBe("SELLER");
    expect((await getDisputeForUser(disputeId, asUser(f.sellerUser)))?.role).toBe("SELLER");
  });

  it("can't be changed at any step", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    const x = f.strangerUser.id;
    const refused = { code: "orderNotFound" };

    await expect(orders.payOrder(orderId, x)).rejects.toMatchObject(refused);
    await expect(orders.cancelOrder(orderId, x, "")).rejects.toMatchObject(refused);
    await orders.payOrder(orderId, f.buyer.id);
    await expect(orders.shipOrder(orderId, x, "JNE", "JNE999999")).rejects.toMatchObject(refused);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    await expect(orders.confirmDelivery(orderId, x)).rejects.toMatchObject(refused);
    await orders.confirmDelivery(orderId, f.buyer.id);
    await expect(orders.requestReturn(orderId, x, "DEFECTIVE", "Battery drains in an hour.")).rejects.toMatchObject(refused);
    await expect(orders.openDispute(orderId, x, "OTHER", "Not my order but I'd like to interfere.")).rejects.toMatchObject(refused);
    await expect(orders.acceptOrder(orderId, x)).rejects.toMatchObject(refused);

    await orders.requestReturn(orderId, f.buyer.id, "DEFECTIVE", "Battery drains in an hour.");
    await expect(orders.respondToReturn(orderId, x, true, "")).rejects.toMatchObject(refused);
    await orders.respondToReturn(orderId, f.sellerUser.id, true, "Send it back please");
    await expect(orders.shipReturn(orderId, x, "JNE", "JNE777777")).rejects.toMatchObject(refused);
    await orders.shipReturn(orderId, f.buyer.id, "JNE", "JNE777777");
    await expect(orders.receiveReturn(orderId, x)).rejects.toMatchObject(refused);

    // None of the stranger's attempts left a trace on the order.
    const events = await db.orderEvent.findMany({ where: { orderId }, select: { actorId: true } });
    expect(events.some((e) => e.actorId === x)).toBe(false);
  });

  it("can't be reviewed by anyone but its buyer", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    await orders.confirmDelivery(orderId, f.buyer.id);
    await orders.acceptOrder(orderId, f.buyer.id);
    await expect(orders.leaveReview(orderId, f.strangerUser.id, 1, "Fake review")).rejects.toMatchObject({ code: "orderNotFound" });
    await expect(orders.leaveReview(orderId, f.sellerUser.id, 5, "Reviewing myself")).rejects.toMatchObject({ code: "orderNotFound" });
    expect(await db.review.count({ where: { orderId } })).toBe(0);
  });
});
