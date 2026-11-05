import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const { deleteAccount, getDeletionBlockers } = await import("@/lib/account/delete");
const storage = await import("@/lib/storage");
const { revalidateTag } = await import("next/cache");

const address = {
  fullName: "Test Buyer",
  phone: "+62 000 0000 000",
  line1: "Jl. Test 1",
  line2: "Blok A",
  city: "Jakarta",
  region: "DKI Jakarta",
  postalCode: "10110",
  country: "Indonesia",
};

const image = () => sharp({ create: { width: 300, height: 300, channels: 3, background: "#3d5af0" } }).png().toBuffer();

async function listing(sellerId: string, slug: string) {
  return db.listing.create({
    data: {
      slug,
      sellerId,
      title: `Item ${slug}`,
      category: "phones",
      brand: "B",
      model: "M",
      description: "d",
      priceIdr: 10_000,
      conditionGrade: "GOOD",
      returnWindowDays: 7,
      status: "ACTIVE",
    },
  });
}

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
    db.favorite.deleteMany(),
    db.upload.deleteMany(),
    db.conditionReport.deleteMany(),
    db.listing.deleteMany(),
    db.verificationRequest.deleteMany(),
    db.sellerProfile.deleteMany(),
    db.oAuthAccount.deleteMany(),
    db.session.deleteMany(),
    db.user.deleteMany(),
  ]);
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Sam Seller", passwordHash: "x" } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Bea Buyer", passwordHash: "x" } });
  const seller = await db.sellerProfile.create({
    data: { userId: sellerUser.id, slug: "sam", displayName: "Sam's Shop", bio: "Bio", location: "Bandung", verificationStatus: "VERIFIED", verifiedAt: new Date() },
  });
  const sold = await listing(seller.id, "sold");
  const unsold = await listing(seller.id, "unsold");
  return { sellerUser, buyer, seller, sold, unsold };
}

/** Buyer buys `sold` and the order completes. */
async function completedOrder(f: Awaited<ReturnType<typeof fixture>>) {
  const { orderId } = await orders.createOrder(f.buyer.id, f.sold.id, address);
  await orders.payOrder(orderId, f.buyer.id);
  await orders.shipOrder(orderId, f.sellerUser.id, "JNE", "JNE123456");
  await orders.confirmDelivery(orderId, f.buyer.id);
  await orders.acceptOrder(orderId, f.buyer.id);
  return orderId;
}

describe("account deletion", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("is refused while a purchase is open, and changes nothing", async () => {
    await orders.createOrder(f.buyer.id, f.sold.id, address);
    await db.session.create({ data: { id: "sess-b", userId: f.buyer.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    expect(await getDeletionBlockers(f.buyer.id)).toEqual({ admin: false, purchases: 1, sales: 0, balance: false });

    await expect(deleteAccount(f.buyer.id)).rejects.toMatchObject({ code: "accountBusy" });
    const buyer = await db.user.findUniqueOrThrow({ where: { id: f.buyer.id } });
    expect(buyer).toMatchObject({ email: "b@test.dev", name: "Bea Buyer", deletedAt: null });
    expect(await db.session.count({ where: { userId: f.buyer.id } })).toBe(1); // rolled back
  });

  it("is refused while a sale is open, and the seller's listings stay up", async () => {
    await orders.createOrder(f.buyer.id, f.sold.id, address);
    expect(await getDeletionBlockers(f.sellerUser.id)).toEqual({ admin: false, purchases: 0, sales: 1, balance: false });

    await expect(deleteAccount(f.sellerUser.id)).rejects.toMatchObject({ code: "accountBusy" });
    expect((await db.listing.findUniqueOrThrow({ where: { id: f.unsold.id } })).status).toBe("ACTIVE");
    expect((await db.sellerProfile.findUniqueOrThrow({ where: { id: f.seller.id } })).displayName).toBe("Sam's Shop");
  });

  it("is refused for admins", async () => {
    await db.user.update({ where: { id: f.buyer.id }, data: { role: "ADMIN" } });
    expect((await getDeletionBlockers(f.buyer.id)).admin).toBe(true);
    await expect(deleteAccount(f.buyer.id)).rejects.toMatchObject({ code: "adminAccount" });
  });

  it("anonymises a buyer but keeps their order and review for the seller", async () => {
    const orderId = await completedOrder(f);
    await db.review.create({ data: { orderId, sellerId: f.seller.id, buyerId: f.buyer.id, rating: 5, comment: "Great" } });
    await db.favorite.create({ data: { userId: f.buyer.id, listingId: f.unsold.id } });
    await db.oAuthAccount.create({ data: { provider: "google", providerAccountId: "g-1", userId: f.buyer.id, email: "b@test.dev" } });
    await db.session.create({ data: { id: "sess-b", userId: f.buyer.id, expiresAt: new Date(Date.now() + 86_400_000) } });

    vi.mocked(revalidateTag).mockClear();
    await deleteAccount(f.buyer.id);
    // The reviewed seller's cached pages show the buyer's name, so they're refreshed.
    expect(vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag)).toContain(`seller-${f.seller.id}`);

    const buyer = await db.user.findUniqueOrThrow({ where: { id: f.buyer.id } });
    expect(buyer.email).toBe(`deleted-${f.buyer.id}@deleted.invalid`);
    expect(buyer).toMatchObject({ name: "", passwordHash: null });
    expect(buyer.deletedAt).toBeInstanceOf(Date);
    expect(await db.session.count({ where: { userId: f.buyer.id } })).toBe(0);
    expect(await db.favorite.count({ where: { userId: f.buyer.id } })).toBe(0);
    expect(await db.oAuthAccount.count({ where: { userId: f.buyer.id } })).toBe(0);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("COMPLETED");
    // Everything that identifies the buyer is blanked, courier note and map pin included; the city stays for records.
    expect(JSON.parse(order.shippingAddress)).toEqual({
      fullName: "",
      phone: "",
      line1: "",
      line2: "",
      postalCode: "",
      note: "",
      latitude: null,
      longitude: null,
      city: "Jakarta",
      region: "DKI Jakarta",
      country: "Indonesia",
    });
    expect(await db.review.count({ where: { orderId } })).toBe(1);

    // The email is free again.
    await expect(db.user.create({ data: { email: "b@test.dev", name: "Bea Again" } })).resolves.toBeTruthy();
  });

  it("deletes a seller's shop, documents and unused photos but keeps photos past orders show", async () => {
    const soldPhoto = await storage.savePublicImage(await image());
    const unsoldPhoto = await storage.savePublicImage(await image());
    const loosePhoto = await storage.savePublicImage(await image());
    await db.upload.create({ data: { ownerId: f.sellerUser.id, listingId: f.sold.id, ...soldPhoto } });
    await db.upload.create({ data: { ownerId: f.sellerUser.id, listingId: f.unsold.id, ...unsoldPhoto } });
    await db.upload.create({ data: { ownerId: f.sellerUser.id, ...loosePhoto } });
    const doc = await storage.savePrivateDocument(await image());
    await db.verificationRequest.create({
      data: { sellerId: f.seller.id, legalName: "Sam Seller", phone: "+62 812", address: "Jl. Rumah", idType: "NATIONAL_ID", idNumberLast4: "1234", documentKey: doc.key, status: "APPROVED" },
    });
    await completedOrder(f);
    await db.sellerProfile.update({ where: { id: f.seller.id }, data: { payoutBank: "bca", payoutAccountNumber: "1234567890", payoutAccountName: "SAM SELLER" } });

    // The sale's money is still in the shop's balance: it has to be withdrawn first.
    await expect(deleteAccount(f.sellerUser.id)).rejects.toMatchObject({ code: "accountHasBalance" });
    const owed = (await db.balanceEntry.aggregate({ where: { sellerId: f.seller.id }, _sum: { amountIdr: true } }))._sum.amountIdr ?? 0;
    const paid = await db.withdrawal.create({ data: { sellerId: f.seller.id, amountIdr: owed, status: "COMPLETED", bank: "bca", accountNumber: "1234567890", accountName: "SAM SELLER" } });
    await db.balanceEntry.create({ data: { sellerId: f.seller.id, type: "WITHDRAWAL", amountIdr: -owed, withdrawalId: paid.id } });

    await deleteAccount(f.sellerUser.id);

    expect(await db.listing.findMany({ where: { sellerId: f.seller.id }, select: { status: true } })).toEqual([{ status: "REMOVED" }, { status: "REMOVED" }]);
    expect(await db.sellerProfile.findUniqueOrThrow({ where: { id: f.seller.id } })).toMatchObject({
      displayName: "",
      bio: "",
      location: "",
      verificationStatus: "UNVERIFIED",
      verifiedAt: null,
      payoutBank: null,
      payoutAccountNumber: null,
      payoutAccountName: null,
    });
    expect(await db.verificationRequest.count({ where: { sellerId: f.seller.id } })).toBe(0);
    expect(await storage.readPrivateDocument(doc.key)).toBeNull();
    expect(await storage.readPublicImage(unsoldPhoto.key)).toBeNull();
    expect(await storage.readPublicImage(loosePhoto.key)).toBeNull();
    expect(await storage.readPublicImage(soldPhoto.key)).not.toBeNull();
    // The buyer's completed order is untouched.
    expect(await db.order.count({ where: { sellerId: f.seller.id, status: "COMPLETED" } })).toBe(1);
  });

  it("does nothing the second time", async () => {
    await deleteAccount(f.buyer.id);
    const first = await db.user.findUniqueOrThrow({ where: { id: f.buyer.id } });
    await deleteAccount(f.buyer.id);
    expect(await db.user.findUniqueOrThrow({ where: { id: f.buyer.id } })).toEqual(first);
  });
});
