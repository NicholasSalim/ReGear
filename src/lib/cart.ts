import "server-only";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/orders/service";

// The cart: listings a buyer means to buy. Every listing is a single used
// item, so there are no quantities, and each one is still checked out as its
// own order (createOrder takes it out of the cart).

export const CART_LIMIT = 50;

export async function addToCart(userId: string, listingId: string) {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { status: true, seller: { select: { userId: true } } } });
  if (!listing || listing.status !== "ACTIVE") throw new DomainError("itemUnavailable");
  if (listing.seller.userId === userId) throw new DomainError("ownListing");
  if ((await db.cartItem.count({ where: { userId } })) >= CART_LIMIT) throw new DomainError("cartFull", CART_LIMIT);
  // Adding twice is harmless: the item is simply already there.
  await db.cartItem.upsert({ where: { userId_listingId: { userId, listingId } }, create: { userId, listingId }, update: {} });
}

export async function removeFromCart(userId: string, listingId: string) {
  await db.cartItem.deleteMany({ where: { userId, listingId } });
}

export async function cartCount(userId: string) {
  return db.cartItem.count({ where: { userId } });
}

export async function isInCart(userId: string, listingId: string) {
  return !!(await db.cartItem.findUnique({ where: { userId_listingId: { userId, listingId } }, select: { userId: true } }));
}

/** The cart with each listing's current price and status, newest first. */
export async function getCart(userId: string) {
  const rows = await db.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      listing: {
        select: {
          id: true,
          slug: true,
          title: true,
          priceIdr: true,
          shippingIdr: true,
          conditionGrade: true,
          status: true,
          returnWindowDays: true,
          images: { select: { key: true }, orderBy: { position: "asc" }, take: 1 },
          seller: { select: { id: true, slug: true, displayName: true } },
        },
      },
    },
  });
  return rows.map((r) => r.listing);
}
