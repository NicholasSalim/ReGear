import { beforeEach, describe, expect, it, vi } from "vitest";

// next/cache is only meaningful inside a Next.js request; the services import
// tag helpers from it, so provide inert stand-ins.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const offers = await import("@/lib/offers");

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
    db.orderEvent.deleteMany(),
    db.balanceEntry.deleteMany(),
    db.order.deleteMany(),
    db.offer.deleteMany(),
    db.conditionReport.deleteMany(),
    db.listing.deleteMany(),
    db.sellerProfile.deleteMany(),
    db.user.deleteMany(),
  ]);
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Seller", passwordHash: "x", emailVerifiedAt: new Date() } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Buyer", passwordHash: "x", emailVerifiedAt: new Date() } });
  const other = await db.user.create({ data: { email: "o@test.dev", name: "Other", passwordHash: "x", emailVerifiedAt: new Date() } });
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
      acceptsOffers: true,
    },
  });
  return { sellerUser, buyer, other, seller, listing };
}

describe("offers", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("checks out an accepted offer at its price, once", async () => {
    const { offerId } = await offers.makeOffer(f.buyer.id, f.listing.id, 8_000, "Would you take 8k?");
    await offers.answerOffer(f.sellerUser.id, offerId, true);

    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address, offerId);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.priceIdr).toBe(8_000);
    expect(order.totalIdr).toBe(8_500);
    expect(order.platformFeeIdr).toBe(400);
    expect(order.offerId).toBe(offerId);
    expect((await db.offer.findUniqueOrThrow({ where: { id: offerId } })).status).toBe("USED");

    // Checking out again returns the same open order rather than a second one.
    expect((await orders.createOrder(f.buyer.id, f.listing.id, address, offerId)).orderId).toBe(orderId);

    // Paid, then back on sale (say the order was cancelled): the used offer can't price another order.
    await orders.payOrder(orderId, f.buyer.id);
    await db.listing.update({ where: { id: f.listing.id }, data: { status: "ACTIVE" } });
    await expect(orders.createOrder(f.buyer.id, f.listing.id, address, offerId)).rejects.toThrow(/answered, used or has expired/);
  });

  it("gives the offer back when an unpaid order is cancelled", async () => {
    const { offerId } = await offers.makeOffer(f.buyer.id, f.listing.id, 8_000, "");
    await offers.answerOffer(f.sellerUser.id, offerId, true);
    const first = await orders.createOrder(f.buyer.id, f.listing.id, address, offerId);
    await orders.cancelOrder(first.orderId, f.buyer.id, "");
    expect((await db.offer.findUniqueOrThrow({ where: { id: offerId } })).status).toBe("ACCEPTED");

    const second = await orders.createOrder(f.buyer.id, f.listing.id, address, offerId);
    expect((await db.order.findUniqueOrThrow({ where: { id: second.orderId } })).priceIdr).toBe(8_000);
  });

  it("only lets the offer's own buyer use it, and only once accepted and unexpired", async () => {
    const { offerId } = await offers.makeOffer(f.buyer.id, f.listing.id, 8_000, "");
    await expect(orders.createOrder(f.buyer.id, f.listing.id, address, offerId)).rejects.toThrow(/answered, used or has expired/);
    await offers.answerOffer(f.sellerUser.id, offerId, true);
    await expect(orders.createOrder(f.other.id, f.listing.id, address, offerId)).rejects.toThrow(/Offer not found/);

    await db.offer.update({ where: { id: offerId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(orders.createOrder(f.buyer.id, f.listing.id, address, offerId)).rejects.toThrow(/answered, used or has expired/);
    // A failed checkout leaves the listing on sale.
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.listing.id } })).status).toBe("ACTIVE");
  });

  it("enforces the price range, one pending offer at a time and the per-listing limit", async () => {
    await expect(offers.makeOffer(f.buyer.id, f.listing.id, 10_000, "")).rejects.toThrow(/less than the asking price/);
    await expect(offers.makeOffer(f.buyer.id, f.listing.id, 4_999, "")).rejects.toThrow(/start at/);
    await expect(offers.makeOffer(f.sellerUser.id, f.listing.id, 8_000, "")).rejects.toThrow(/own listing/);

    const first = await offers.makeOffer(f.buyer.id, f.listing.id, 6_000, "");
    await expect(offers.makeOffer(f.buyer.id, f.listing.id, 7_000, "")).rejects.toThrow(/already have an offer waiting/);
    await offers.answerOffer(f.sellerUser.id, first.offerId, false);
    const second = await offers.makeOffer(f.buyer.id, f.listing.id, 7_000, "");
    await offers.withdrawOffer(f.buyer.id, second.offerId);
    await offers.makeOffer(f.buyer.id, f.listing.id, 7_500, "");
    await db.offer.updateMany({ where: { buyerId: f.buyer.id, status: "PENDING" }, data: { status: "DECLINED" } });
    await expect(offers.makeOffer(f.buyer.id, f.listing.id, 8_000, "")).rejects.toThrow(/up to 3 offers/);
  });

  it("refuses offers when the seller hasn't turned them on", async () => {
    await db.listing.update({ where: { id: f.listing.id }, data: { acceptsOffers: false } });
    await expect(offers.makeOffer(f.buyer.id, f.listing.id, 8_000, "")).rejects.toThrow(/isn't taking offers/);
  });

  it("lets only the listing's seller answer, and only while the offer is pending", async () => {
    const { offerId } = await offers.makeOffer(f.buyer.id, f.listing.id, 8_000, "");
    await expect(offers.answerOffer(f.other.id, offerId, true)).rejects.toThrow(/Offer not found/);
    await expect(offers.withdrawOffer(f.other.id, offerId)).rejects.toThrow(/Offer not found/);
    await offers.answerOffer(f.sellerUser.id, offerId, false);
    await expect(offers.answerOffer(f.sellerUser.id, offerId, true)).rejects.toThrow(/answered, used or has expired/);
    await expect(offers.withdrawOffer(f.buyer.id, offerId)).rejects.toThrow(/answered, used or has expired/);
  });

  it("emails the seller about a new offer and the buyer about the answer", async () => {
    const { offerId } = await offers.makeOffer(f.buyer.id, f.listing.id, 8_000, "");
    await offers.answerOffer(f.sellerUser.id, offerId, true);
    const sent = await db.emailOutbox.findMany({ orderBy: { createdAt: "asc" }, select: { userId: true, template: true } });
    expect(sent).toEqual([
      { userId: f.sellerUser.id, template: "offer-received" },
      { userId: f.buyer.id, template: "offer-answered" },
    ]);
  });
});
