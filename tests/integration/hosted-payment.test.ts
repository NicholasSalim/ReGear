import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const refunds = await import("@/lib/orders/refunds");
const { payments } = await import("@/lib/payments");

// The simulated provider pays instantly. These tests make it behave like a
// hosted one (Midtrans Snap): checkout hands back a payment page, and the
// outcome is only known by asking for the status later.
const PAGE = "https://app.sandbox.midtrans.com/snap/v4/redirection/tok";

const address = { fullName: "Test Buyer", phone: "+62 000 0000 000", line1: "Jl. Test 1", line2: "", city: "Jakarta", region: "", postalCode: "10110", country: "Indonesia" };

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
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Seller", passwordHash: "x", emailVerifiedAt: new Date() } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Buyer", passwordHash: "x", emailVerifiedAt: new Date() } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, slug: "s", displayName: "S" } });
  const listing = await db.listing.create({
    data: { slug: "item", sellerId: seller.id, title: "Test item", category: "phones", brand: "B", model: "M", description: "d", priceIdr: 10_000, shippingIdr: 500, conditionGrade: "GOOD", returnWindowDays: 7, status: "ACTIVE" },
  });
  const { orderId } = await orders.createOrder(buyer.id, listing.id, address);
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  return { sellerUser, buyer, listing, order };
}

describe("hosted payment page", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
    vi.spyOn(payments, "checkout").mockResolvedValue({ redirectUrl: PAGE });
    vi.spyOn(payments, "status").mockResolvedValue({ state: "none" });
    vi.spyOn(payments, "abandon").mockResolvedValue({ state: "none" });
  });
  afterEach(() => vi.restoreAllMocks());

  const paid = () => ({ state: "paid" as const, ref: "mt-tx-1", amountIdr: f.order.totalIdr });
  const statusOf = async () => (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status;

  it("sends the buyer to the payment page, once", async () => {
    const first = await orders.payOrder(f.order.id, f.buyer.id, "en");
    expect(first).toMatchObject({ redirectUrl: PAGE });
    expect(payments.checkout).toHaveBeenCalledWith(expect.objectContaining({
      orderId: f.order.id,
      amountIdr: f.order.totalIdr,
      returnUrl: expect.stringContaining(`/api/payments/return?order=${f.order.id}&lang=en`),
    }));
    expect(await statusOf()).toBe("PENDING_PAYMENT");

    // Clicking Pay again returns to the same page rather than opening another.
    expect(await orders.payOrder(f.order.id, f.buyer.id)).toMatchObject({ redirectUrl: PAGE });
    expect(payments.checkout).toHaveBeenCalledTimes(1);
  });

  it("sends both requests of a double click to the same page", async () => {
    vi.mocked(payments.checkout).mockResolvedValueOnce({ redirectUrl: `${PAGE}-a` }).mockResolvedValueOnce({ redirectUrl: `${PAGE}-b` });
    const [a, b] = await Promise.all([orders.payOrder(f.order.id, f.buyer.id), orders.payOrder(f.order.id, f.buyer.id)]);
    expect(a).toEqual(b);
  });

  it("marks the order paid only when the provider reports the full amount", async () => {
    await orders.payOrder(f.order.id, f.buyer.id);
    await orders.syncPayment(f.order.id); // still "none": the buyer hasn't paid
    expect(await statusOf()).toBe("PENDING_PAYMENT");

    vi.mocked(payments.status).mockResolvedValue({ ...paid(), amountIdr: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await orders.syncPayment(f.order.id);
    expect(await statusOf()).toBe("PENDING_PAYMENT");

    vi.mocked(payments.status).mockResolvedValue(paid());
    // The webhook and the buyer's return arrive together: one PAID event, no error.
    await Promise.all([orders.syncPayment(f.order.id), orders.syncPayment(f.order.id)]);
    const order = await db.order.findUniqueOrThrow({ where: { id: f.order.id }, include: { events: true } });
    expect(order).toMatchObject({ status: "PAID", paymentRef: "mt-tx-1" });
    expect(order.events.filter((e) => e.type === "PAID")).toHaveLength(1);
  });

  it("clicking Pay after paying confirms the payment instead of starting another", async () => {
    await orders.payOrder(f.order.id, f.buyer.id);
    vi.mocked(payments.status).mockResolvedValue(paid());
    expect(await orders.payOrder(f.order.id, f.buyer.id)).toMatchObject({ paid: true });
    expect(await statusOf()).toBe("PAID");
  });

  it("releases the item when the payment failed", async () => {
    await orders.payOrder(f.order.id, f.buyer.id);
    vi.mocked(payments.status).mockResolvedValue({ state: "failed" });
    await orders.syncPayment(f.order.id);
    expect(await statusOf()).toBe("CANCELLED");
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("ACTIVE");
  });

  it("stops the payment before expiring, and keeps an order paid at the last moment", async () => {
    await orders.payOrder(f.order.id, f.buyer.id);
    await db.order.update({ where: { id: f.order.id }, data: { reservedAt: new Date(Date.now() - 86_400_000) } });

    vi.mocked(payments.abandon).mockResolvedValue(paid());
    await orders.runOrderMaintenance();
    expect(payments.abandon).toHaveBeenCalledWith(f.order.id);
    expect(await statusOf()).toBe("PAID");
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("RESERVED");
  });

  it("expires the order once the payment is stopped", async () => {
    await orders.payOrder(f.order.id, f.buyer.id);
    await db.order.update({ where: { id: f.order.id }, data: { reservedAt: new Date(Date.now() - 86_400_000) } });
    vi.mocked(payments.abandon).mockResolvedValue({ state: "failed" });
    expect((await orders.runOrderMaintenance()).expired).toBe(1);
    expect(await statusOf()).toBe("CANCELLED");
  });

  it("picks up a payment whose webhook never arrived", async () => {
    await orders.payOrder(f.order.id, f.buyer.id);
    vi.mocked(payments.status).mockResolvedValue(paid());
    await orders.runOrderMaintenance();
    expect(await statusOf()).toBe("PAID");
  });

  it("refunds when the buyer paid just as the order was cancelled", async () => {
    await orders.payOrder(f.order.id, f.buyer.id);
    vi.mocked(payments.abandon).mockResolvedValue(paid());
    const refund = vi.spyOn(payments, "refund");
    await orders.cancelOrder(f.order.id, f.buyer.id, "");
    const order = await db.order.findUniqueOrThrow({ where: { id: f.order.id } });
    expect(order).toMatchObject({ status: "CANCELLED", paymentRef: "mt-tx-1", refundIdr: order.totalIdr });
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ orderId: f.order.id, amountIdr: order.totalIdr }));
  });

  it("refunds a payment that lands on an already cancelled order", async () => {
    await orders.payOrder(f.order.id, f.buyer.id);
    await orders.cancelOrder(f.order.id, f.buyer.id, "");
    vi.mocked(payments.status).mockResolvedValue(paid());
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refund = vi.spyOn(payments, "refund");
    await orders.syncPayment(f.order.id);
    await orders.syncPayment(f.order.id); // a repeated notification refunds nothing more
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).toMatchObject({ status: "CANCELLED", refundIdr: f.order.totalIdr });
  });
});

describe("refunding a bank transfer", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  const account = { bank: "bca", accountNumber: "1234567890", accountName: "Test Buyer" };
  beforeEach(async () => {
    f = await fixture();
    vi.spyOn(payments, "checkout").mockResolvedValue({ redirectUrl: PAGE });
    vi.spyOn(payments, "status").mockResolvedValue({ state: "paid", ref: "mt-va-1", amountIdr: f.order.totalIdr, method: "bank_transfer" });
    vi.spyOn(payments, "abandon").mockResolvedValue({ state: "none" });
    // Paying by bank transfer, then cancelling.
    await orders.payOrder(f.order.id, f.buyer.id);
    await orders.syncPayment(f.order.id);
  });
  afterEach(() => vi.restoreAllMocks());

  const order = () => db.order.findUniqueOrThrow({ where: { id: f.order.id }, include: { events: true } });

  it("asks the buyer for an account instead of refunding through the provider", async () => {
    const refund = vi.spyOn(payments, "refund");
    await orders.cancelOrder(f.order.id, f.buyer.id, "");
    await orders.runOrderMaintenance(); // and maintenance doesn't try either
    expect(refund).not.toHaveBeenCalled();
    const o = await order();
    expect(o).toMatchObject({ status: "CANCELLED", paymentMethod: "bank_transfer", refundIdr: o.totalIdr, refundedAt: null });
    expect(o.events.map((e) => e.type)).toContain("REFUND_BY_HAND");
    expect(await db.emailOutbox.count({ where: { userId: f.buyer.id, params: { contains: "REFUND_BY_HAND" } } })).toBe(1);
  });

  it("sends it by hand to the account only its buyer gives", async () => {
    await orders.cancelOrder(f.order.id, f.buyer.id, "");
    await expect(refunds.markRefundSent(f.order.id, f.sellerUser.id, "BCA ref 123")).rejects.toThrow(/hasn't given a bank account/);
    await expect(refunds.setRefundAccount(f.order.id, f.sellerUser.id, account)).rejects.toThrow(/not found/i);
    await expect(refunds.setRefundAccount(f.order.id, f.buyer.id, { ...account, bank: "nope" })).rejects.toThrow(/listed banks/);

    await refunds.setRefundAccount(f.order.id, f.buyer.id, account);
    expect(await order()).toMatchObject({ refundBank: "bca", refundAccountNumber: "1234567890", refundAccountName: "Test Buyer" });

    await refunds.markRefundSent(f.order.id, f.sellerUser.id, "BCA ref 123");
    const o = await order();
    expect(o.refundedAt).not.toBeNull();
    expect(o.refundNote).toBe("BCA ref 123");
    expect(o.events.map((e) => e.type)).toEqual(expect.arrayContaining(["REFUND_ACCOUNT_SET", "REFUND_SENT"]));
    // Sent once: a second admin, or a late change of account, finds nothing owed.
    await expect(refunds.markRefundSent(f.order.id, f.sellerUser.id, "again")).rejects.toThrow(/no bank-transfer refund/);
    await expect(refunds.setRefundAccount(f.order.id, f.buyer.id, account)).rejects.toThrow(/no bank-transfer refund/);
  });

  it("asks the provider how an order was paid when it wasn't recorded", async () => {
    // Paid before the method was recorded, e.g. by an older deployment.
    await db.order.update({ where: { id: f.order.id }, data: { paymentMethod: null } });
    const refund = vi.spyOn(payments, "refund");
    await orders.cancelOrder(f.order.id, f.buyer.id, "");
    expect(refund).not.toHaveBeenCalled();
    const o = await order();
    expect(o).toMatchObject({ paymentMethod: "bank_transfer", refundedAt: null });
    expect(o.events.map((e) => e.type)).toContain("REFUND_BY_HAND");
  });

  it("isn't asked of an order that owes nothing", async () => {
    await expect(refunds.setRefundAccount(f.order.id, f.buyer.id, account)).rejects.toThrow(/no bank-transfer refund/);
  });
});
