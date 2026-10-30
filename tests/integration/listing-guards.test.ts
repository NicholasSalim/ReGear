import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const { updateOpenListing } = await import("@/lib/listings");
const { shopNameKey, shopNameTaken } = await import("@/lib/shop-name");

async function fixture() {
  const mine = { user: { email: { endsWith: "@guards.test" } } };
  await db.listing.deleteMany({ where: { seller: mine } });
  await db.sellerProfile.deleteMany({ where: mine });
  await db.user.deleteMany({ where: { email: { endsWith: "@guards.test" } } });
  const user = await db.user.create({ data: { email: "shop@guards.test", name: "Shop", emailVerifiedAt: new Date() } });
  const seller = await db.sellerProfile.create({ data: { userId: user.id, slug: "guards-shop", displayName: "Guard's Trusted-Shop" } });
  return { seller };
}

describe("listing writes", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  const listing = (status: "ACTIVE" | "RESERVED" | "SOLD" | "DRAFT") =>
    db.listing.create({
      data: { slug: `guard-${status}`, sellerId: f.seller.id, title: "Item", category: "phones", brand: "B", model: "M", description: "d", priceIdr: 10_000, conditionGrade: "GOOD", returnWindowDays: 7, status },
    });

  it("changes a listing that's still open", async () => {
    const { id } = await listing("ACTIVE");
    expect(await updateOpenListing(db, id, { priceIdr: 20_000, status: "DRAFT" })).toBe(true);
    expect(await db.listing.findUniqueOrThrow({ where: { id } })).toMatchObject({ priceIdr: 20_000, status: "DRAFT" });
  });

  it.each(["RESERVED", "SOLD"] as const)("can't put a %s listing back on sale", async (status) => {
    const { id } = await listing(status);
    expect(await updateOpenListing(db, id, { priceIdr: 20_000, status: "ACTIVE" })).toBe(false);
    expect(await db.listing.findUniqueOrThrow({ where: { id } })).toMatchObject({ priceIdr: 10_000, status });
  });
});

describe("shop names", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  const taken = (name: string, except?: string) => db.$transaction((tx) => shopNameTaken(tx, name, except));

  it("ignores capitals, accents, spaces and punctuation", () => {
    expect(shopNameKey("Tech-Haven  Réfurb!")).toBe(shopNameKey("techhaven refurb"));
  });

  it("refuses another shop's name, however it's written", async () => {
    expect(await taken("Guard's Trusted-Shop")).toBe(true);
    expect(await taken("GUARDS TRUSTED SHOP")).toBe(true);
    expect(await taken("Guards Other Shop")).toBe(false);
  });

  it("doesn't count a shop's own name", async () => {
    expect(await taken("guards trusted shop", f.seller.id)).toBe(false);
  });
});
