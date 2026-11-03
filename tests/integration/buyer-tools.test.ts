import { beforeEach, describe, expect, it, vi } from "vitest";

// next/cache is only meaningful inside a Next.js request; the services import
// tag helpers from it, so provide inert stand-ins.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const cart = await import("@/lib/cart");
const messages = await import("@/lib/messages");
const searches = await import("@/lib/saved-searches");

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
    db.message.deleteMany(),
    db.conversation.deleteMany(),
    db.savedSearch.deleteMany(),
    db.cartItem.deleteMany(),
    db.orderEvent.deleteMany(),
    db.balanceEntry.deleteMany(),
    db.order.deleteMany(),
    db.offer.deleteMany(),
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
      title: "Sony camera",
      category: "cameras",
      brand: "Sony",
      model: "A7",
      description: "d",
      searchText: "sony camera a7",
      priceIdr: 10_000,
      shippingIdr: 500,
      conditionGrade: "GOOD",
      status: "ACTIVE",
      publishedAt: new Date(Date.now() - 3 * 3_600_000),
    },
  });
  return { sellerUser, buyer, other, seller, listing };
}

const emails = (template: string) => db.emailOutbox.findMany({ where: { template }, select: { userId: true } });

describe("cart", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("adds once, refuses your own listing, and empties when you order the item", async () => {
    await cart.addToCart(f.buyer.id, f.listing.id);
    await cart.addToCart(f.buyer.id, f.listing.id);
    expect(await cart.cartCount(f.buyer.id)).toBe(1);
    await expect(cart.addToCart(f.sellerUser.id, f.listing.id)).rejects.toThrow(/own listing/);

    await orders.createOrder(f.buyer.id, f.listing.id, address);
    expect(await cart.cartCount(f.buyer.id)).toBe(0);
    // Still on sale until the buyer starts paying, so others can still add it.
    await cart.addToCart(f.other.id, f.listing.id);
    expect(await cart.cartCount(f.other.id)).toBe(1);
  });
});

describe("messages", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("emails only when a conversation turns unread, and only participants get in", async () => {
    const { conversationId } = await messages.startConversation(f.buyer.id, f.listing.id, "Is it still available?");
    await messages.reply(f.buyer.id, conversationId, "And does it come with the box?");
    expect(await emails("message-received")).toEqual([{ userId: f.sellerUser.id }]);
    expect(await messages.unreadCount(f.sellerUser.id)).toBe(1);
    expect(await messages.unreadCount(f.buyer.id)).toBe(0);

    await messages.markRead(f.sellerUser.id, conversationId);
    expect(await messages.unreadCount(f.sellerUser.id)).toBe(0);
    await messages.reply(f.sellerUser.id, conversationId, "Yes, box included.");
    expect((await emails("message-received")).map((e) => e.userId)).toEqual([f.sellerUser.id, f.buyer.id]);

    await expect(messages.reply(f.other.id, conversationId, "hi")).rejects.toThrow(/Conversation not found/);
    expect(await messages.getConversation(f.other.id, conversationId)).toBeNull();
    await messages.markRead(f.other.id, conversationId); // ignored, not an error
    await expect(messages.startConversation(f.sellerUser.id, f.listing.id, "hi")).rejects.toThrow(/your own listing/);
  });

  it("keeps one conversation per buyer and listing", async () => {
    const a = await messages.startConversation(f.buyer.id, f.listing.id, "First");
    const b = await messages.startConversation(f.buyer.id, f.listing.id, "Second");
    expect(b.conversationId).toBe(a.conversationId);
    expect(await db.message.count({ where: { conversationId: a.conversationId } })).toBe(2);
  });
});

describe("saved searches", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("recognises the same filters saved twice, in any order", async () => {
    const a = await searches.saveSearch(f.buyer.id, searches.parseQuery("q=sony&grade=GOOD&grade=EXCELLENT"), "sony");
    const b = await searches.saveSearch(f.buyer.id, searches.parseQuery("grade=EXCELLENT&q=sony&grade=GOOD&page=3&sort=price_asc"), "sony");
    expect(b.id).toBe(a.id);
    await expect(searches.deleteSavedSearch(f.other.id, a.id)).rejects.toThrow(/not found/);
  });

  it("alerts about listings published since the last alert, then moves on", async () => {
    const { id } = await searches.saveSearch(f.buyer.id, searches.parseQuery("q=sony"), "sony");
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
    await db.savedSearch.update({ where: { id }, data: { lastAlertedAt: twoHoursAgo } });

    // The listing was published three hours ago: before the window, so no alert.
    expect(await searches.runSavedSearchAlerts()).toBe(0);
    expect(await emails("saved-search-alert")).toEqual([]);

    await db.savedSearch.update({ where: { id }, data: { lastAlertedAt: new Date(Date.now() - 4 * 3_600_000) } });
    expect(await searches.runSavedSearchAlerts()).toBe(1);
    expect(await emails("saved-search-alert")).toEqual([{ userId: f.buyer.id }]);
    // Run again straight away: the search isn't due, and the same listing is never counted twice.
    expect(await searches.runSavedSearchAlerts()).toBe(0);

    await searches.setAlerts(f.buyer.id, id, false);
    await db.savedSearch.update({ where: { id }, data: { lastAlertedAt: new Date(Date.now() - 4 * 3_600_000) } });
    expect(await searches.runSavedSearchAlerts()).toBe(0);
  });
});
