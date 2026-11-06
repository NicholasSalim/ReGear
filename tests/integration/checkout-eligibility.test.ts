import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const { payments } = await import("@/lib/payments");
const { MAX_ABANDONED_CHECKOUTS, MAX_UNPAID_ORDERS, PAY_HOLD_MINUTES } = await import("@/lib/constants");

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
    db.cartItem.deleteMany(),
    db.orderEvent.deleteMany(),
    db.balanceEntry.deleteMany(),
    db.withdrawal.deleteMany(),
    db.order.deleteMany(),
    db.offer.deleteMany(),
    db.conditionReport.deleteMany(),
    db.listing.deleteMany(),
    db.sellerProfile.deleteMany(),
    db.user.deleteMany(),
  ]);
  const verified = { passwordHash: "x", emailVerifiedAt: new Date() };
  const admin = await db.user.create({ data: { email: "a@test.dev", name: "Admin", role: "ADMIN", ...verified } });
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Seller", ...verified } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Buyer", ...verified } });
  const other = await db.user.create({ data: { email: "o@test.dev", name: "Other", ...verified } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, slug: "s", displayName: "S" } });
  const listing = (slug: string) =>
    db.listing.create({
      data: {
        slug,
        sellerId: seller.id,
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
      },
    });
  return { admin, sellerUser, buyer, other, listing: await listing("item"), makeListing: listing };
}

describe("checkout eligibility", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });
  afterEach(() => vi.restoreAllMocks());

  /** The buyer pressed Pay and is on the payment page: the item is held for them. */
  async function holdFor(buyerId: string) {
    vi.spyOn(payments, "checkout").mockResolvedValue({ redirectUrl: "https://pay.test/page" });
    vi.spyOn(payments, "abandon").mockResolvedValue({ state: "none" });
    const { orderId } = await orders.createOrder(buyerId, f.listing.id, address);
    await orders.payOrder(orderId, buyerId);
    return orderId;
  }

  it("can buy at the listed price, or at an accepted offer's price", async () => {
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id)).toMatchObject({ ok: true, priceIdr: 10_000, offer: null, openOrderId: null });
    const offer = await db.offer.create({ data: { listingId: f.listing.id, buyerId: f.buyer.id, amountIdr: 8_000, status: "ACCEPTED", expiresAt: new Date(Date.now() + 3_600_000) } });
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id, offer.id)).toMatchObject({ ok: true, priceIdr: 8_000, offer: { id: offer.id, amountIdr: 8_000 } });
  });

  it("refuses what isn't for this buyer", async () => {
    expect(await orders.checkoutEligibility(f.buyer.id, "nosuchlistingid000000000")).toEqual({ ok: false, reason: "notFound" });
    expect(await orders.checkoutEligibility(f.sellerUser.id, f.listing.id)).toEqual({ ok: false, reason: "ownListing" });
    expect(await orders.checkoutEligibility(f.admin.id, f.listing.id)).toEqual({ ok: false, reason: "adminCannotTrade" });
    await db.user.update({ where: { id: f.buyer.id }, data: { emailVerifiedAt: null } });
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id)).toEqual({ ok: false, reason: "verifyEmail" });
  });

  it("points the buyer to their own order, and tells others it's being paid for or gone", async () => {
    const orderId = await holdFor(f.buyer.id);
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id)).toEqual({ ok: false, reason: "yourOrder", orderId, unpaid: true, beingPaid: true });
    expect(await orders.checkoutEligibility(f.other.id, f.listing.id)).toEqual({ ok: false, reason: "unavailable", beingPaid: true });

    await db.order.update({ where: { id: orderId }, data: { status: "PAID", paidAt: new Date() } });
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id)).toEqual({ ok: false, reason: "yourOrder", orderId, unpaid: false, beingPaid: false });
    await db.listing.update({ where: { id: f.listing.id }, data: { status: "SOLD" } });
    expect(await orders.checkoutEligibility(f.other.id, f.listing.id)).toEqual({ ok: false, reason: "unavailable", beingPaid: false });
  });

  it("treats a payment hold that has run out as on sale, and placing the order releases it", async () => {
    const orderId = await holdFor(f.other.id);
    await db.order.update({ where: { id: orderId }, data: { reservedAt: new Date(Date.now() - (PAY_HOLD_MINUTES + 1) * 60_000) } });
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id)).toMatchObject({ ok: true, openOrderId: null });
    // Only a read: pages ask this while rendering, so nothing changes yet.
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("RESERVED");

    const placed = await orders.createOrder(f.buyer.id, f.listing.id, address);
    expect(placed.orderId).not.toBe(orderId);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("CANCELLED");
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("ACTIVE");
  });

  it("refuses an offer that isn't theirs, or isn't accepted any more", async () => {
    const theirs = await db.offer.create({ data: { listingId: f.listing.id, buyerId: f.other.id, amountIdr: 8_000, status: "ACCEPTED", expiresAt: new Date(Date.now() + 3_600_000) } });
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id, theirs.id)).toEqual({ ok: false, reason: "offerUnavailable", missing: true });
    const expired = await db.offer.create({ data: { listingId: f.listing.id, buyerId: f.buyer.id, amountIdr: 8_000, status: "ACCEPTED", expiresAt: new Date(Date.now() - 1000) } });
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id, expired.id)).toEqual({ ok: false, reason: "offerUnavailable", missing: false });
  });

  it("applies the unpaid-order limit before the buyer fills anything in, and again when ordering", async () => {
    for (let i = 0; i < MAX_UNPAID_ORDERS; i++) await orders.createOrder(f.buyer.id, (await f.makeListing(`other-${i}`)).id, address);
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id)).toEqual({ ok: false, reason: "tooManyUnpaid", limit: MAX_UNPAID_ORDERS });
    await expect(orders.createOrder(f.buyer.id, f.listing.id, address)).rejects.toMatchObject({ code: "tooManyUnpaidOrders" });
  });

  it("asks a buyer who keeps abandoning the same checkout to come back later", async () => {
    for (let i = 0; i < MAX_ABANDONED_CHECKOUTS; i++) {
      const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
      await db.order.update({ where: { id: orderId }, data: { status: "CANCELLED", reservedAt: new Date(), cancelledAt: new Date() } });
    }
    expect(await orders.checkoutEligibility(f.buyer.id, f.listing.id)).toEqual({ ok: false, reason: "tryLater" });
    await expect(orders.createOrder(f.buyer.id, f.listing.id, address)).rejects.toMatchObject({ code: "checkoutAgainLater" });
  });

  it("gives the same order back on a second checkout, even after its offer was used", async () => {
    const offer = await db.offer.create({ data: { listingId: f.listing.id, buyerId: f.buyer.id, amountIdr: 8_000, status: "ACCEPTED", expiresAt: new Date(Date.now() + 3_600_000) } });
    const first = await orders.createOrder(f.buyer.id, f.listing.id, address, offer.id);
    const again = await orders.createOrder(f.buyer.id, f.listing.id, address, offer.id);
    expect(again.orderId).toBe(first.orderId);
  });
});
