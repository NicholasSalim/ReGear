import { beforeEach, describe, expect, it, vi } from "vitest";

// next/cache is only meaningful inside a Next.js request; the service imports
// tag helpers from it, so provide inert stand-ins.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const { payments } = await import("@/lib/payments");

const address = {
  fullName: "Test Buyer",
  phone: "+62 811 0000 000",
  line1: "Jl. Test 1",
  line2: "",
  city: "Jakarta",
  region: "",
  postalCode: "10110",
  country: "Indonesia",
};

async function fixture() {
  await db.$transaction([
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
    db.user.deleteMany(),
  ]);
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Seller", passwordHash: "x" } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Buyer", passwordHash: "x" } });
  const other = await db.user.create({ data: { email: "o@test.dev", name: "Other", passwordHash: "x" } });
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
  return { sellerUser, buyer, other, seller, listing };
}

describe("order lifecycle", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("runs checkout → payment → shipping → delivery → completion", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("RESERVED");

    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    await orders.confirmDelivery(orderId, f.buyer.id);
    await orders.acceptOrder(orderId, f.buyer.id);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { events: true } });
    expect(order.status).toBe("COMPLETED");
    expect(order.totalIdr).toBe(10_500);
    expect(order.platformFeeIdr).toBe(500);
    expect(order.events.map((e) => e.type)).toEqual(["CREATED", "PAID", "SHIPPED", "DELIVERED", "COMPLETED"]);
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("SOLD");
    expect((await db.sellerProfile.findUniqueOrThrow({ where: { id: f.seller.id } })).salesCount).toBe(1);

    await orders.leaveReview(orderId, f.buyer.id, 4, "Good");
    expect((await db.sellerProfile.findUniqueOrThrow({ where: { id: f.seller.id } })).ratingAvg).toBe(4);
    await expect(orders.leaveReview(orderId, f.buyer.id, 5, "")).rejects.toThrow(/already reviewed/);
  });

  it("prevents double-selling and self-purchase", async () => {
    await orders.createOrder(f.buyer.id, f.listing.id, address);
    await expect(orders.createOrder(f.other.id, f.listing.id, address)).rejects.toThrow(/no longer available/);
    await db.listing.update({ where: { id: f.listing.id }, data: { status: "ACTIVE" } });
    await expect(orders.createOrder(f.sellerUser.id, f.listing.id, address)).rejects.toThrow(/own listing/);
  });

  it("enforces ownership on every transition (no IDOR)", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await expect(orders.payOrder(orderId, f.other.id)).rejects.toThrow(/not found/i);
    await orders.payOrder(orderId, f.buyer.id);
    await expect(orders.shipOrder(orderId, f.buyer.id, "JNE", "X12345")).rejects.toThrow(/not found/i);
    await expect(orders.shipOrder(orderId, f.other.id, "JNE", "X12345")).rejects.toThrow(/not found/i);
  });

  it("rejects out-of-order transitions", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await expect(orders.shipOrder(orderId, f.sellerUser.id, "JNE", "X12345")).rejects.toThrow(/cannot move/);
    await expect(orders.confirmDelivery(orderId, f.buyer.id)).rejects.toThrow(/cannot move/);
  });

  it("cancelling a paid order refunds and relists the item", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.cancelOrder(orderId, f.sellerUser.id, "Out of stock");
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("CANCELLED");
    expect(order.refundIdr).toBe(order.totalIdr);
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("ACTIVE");
  });

  it("handles a full return", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    await orders.confirmDelivery(orderId, f.buyer.id);
    await orders.requestReturn(orderId, f.buyer.id, "NOT_AS_DESCRIBED", "Battery health is far lower than reported.");
    await expect(orders.receiveReturn(orderId, f.sellerUser.id)).rejects.toThrow(/not been shipped back/);
    await orders.respondToReturn(orderId, f.sellerUser.id, true, "Ship to our store");
    await orders.shipReturn(orderId, f.buyer.id, "JNE", "RET123456");
    await orders.receiveReturn(orderId, f.sellerUser.id);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { returnRequest: true } });
    expect(order.status).toBe("REFUNDED");
    expect(order.returnRequest?.status).toBe("REFUNDED");
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("DRAFT");
  });

  it("refuses returns once the window has closed", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    await orders.confirmDelivery(orderId, f.buyer.id);
    await db.order.update({ where: { id: orderId }, data: { deliveredAt: new Date(Date.now() - 8 * 86_400_000) } });
    await expect(orders.requestReturn(orderId, f.buyer.id, "CHANGED_MIND", "No longer needed, sorry about that.")).rejects.toThrow(/window/);
  });

  it("resolves disputes with partial refunds", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    const { disputeId } = await orders.openDispute(orderId, f.buyer.id, "NOT_RECEIVED", "Tracking has not updated for ten days now.");
    await expect(orders.openDispute(orderId, f.buyer.id, "OTHER", "Second dispute should not be allowed here.")).rejects.toThrow(/already open/);
    await expect(orders.resolveDispute(disputeId, f.other.id, "PARTIAL_REFUND", "note", 999_999)).rejects.toThrow(/Partial refund/);
    await orders.resolveDispute(disputeId, f.other.id, "PARTIAL_REFUND", "Split the difference", 2_500);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("COMPLETED");
    expect(order.refundIdr).toBe(2_500);
    expect((await db.dispute.findUniqueOrThrow({ where: { id: disputeId } })).status).toBe("RESOLVED");
  });

  it("caps partial refunds so the seller's payout stays positive", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    const { disputeId } = await orders.openDispute(orderId, f.buyer.id, "NOT_RECEIVED", "Tracking has not updated for ten days now.");
    // Total 10.500, fee 500: a 10.000 refund would leave the seller nothing.
    await expect(orders.resolveDispute(disputeId, f.other.id, "PARTIAL_REFUND", "Too much", 10_000)).rejects.toThrow(/Partial refund/);
    await orders.resolveDispute(disputeId, f.other.id, "PARTIAL_REFUND", "Almost all of it", 9_999);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).refundIdr).toBe(9_999);
  });

  it("lets a buyer neither undo a return by confirming delivery nor settle a dispute by accepting", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    await orders.confirmDelivery(orderId, f.buyer.id);
    await orders.requestReturn(orderId, f.buyer.id, "NOT_AS_DESCRIBED", "Battery health is far lower than reported.");
    await expect(orders.confirmDelivery(orderId, f.buyer.id)).rejects.toThrow(/cannot move/);

    await orders.openDispute(orderId, f.buyer.id, "NOT_AS_DESCRIBED", "The seller has not answered my return request.");
    await expect(orders.acceptOrder(orderId, f.buyer.id)).rejects.toThrow(/cannot move/);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("DISPUTED");
  });
});

describe("money movements under concurrency", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
    vi.restoreAllMocks();
  });

  it("refunds once and credits the seller once when a resolution is submitted twice at once", async () => {
    const refund = vi.spyOn(payments, "refund");
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    const { disputeId } = await orders.openDispute(orderId, f.buyer.id, "NOT_RECEIVED", "Tracking has not updated for ten days now.");

    const results = await Promise.allSettled([
      orders.resolveDispute(disputeId, f.other.id, "PARTIAL_REFUND", "Split the difference", 2_500),
      orders.resolveDispute(disputeId, f.other.id, "PARTIAL_REFUND", "Split the difference", 2_500),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // However many requests reach the provider, they name the same movement, so it happens once.
    expect(new Set(refund.mock.calls.map(([c]) => c.idempotencyKey))).toEqual(new Set([`order:${orderId}:refund`]));
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).refundIdr).toBe(2_500);
    // The seller gets total minus the platform fee minus the refund, once.
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const credits = await db.balanceEntry.findMany({ where: { orderId } });
    expect(credits.map((c) => c.amountIdr)).toEqual([order.totalIdr - order.platformFeeIdr - 2_500]);
  });

  it("refunds a paid order once when buyer and seller cancel at the same time", async () => {
    const refund = vi.spyOn(payments, "refund");
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    const results = await Promise.allSettled([
      orders.cancelOrder(orderId, f.buyer.id, ""),
      orders.cancelOrder(orderId, f.sellerUser.id, ""),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(new Set(refund.mock.calls.map(([c]) => c.idempotencyKey))).toEqual(new Set([`order:${orderId}:refund`]));
  });
});

describe("order maintenance", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("maintenance expires unpaid orders and releases the listing", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await db.order.update({ where: { id: orderId }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    const res = await orders.runOrderMaintenance();
    expect(res.expired).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("CANCELLED");
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("ACTIVE");
  });

  it("maintenance auto-completes orders after the return window", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    await orders.payOrder(orderId, f.buyer.id);
    await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
    await orders.confirmDelivery(orderId, f.buyer.id);
    await db.order.update({ where: { id: orderId }, data: { deliveredAt: new Date(Date.now() - 10 * 86_400_000) } });
    await orders.runOrderMaintenance();
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("COMPLETED");
  });
});
