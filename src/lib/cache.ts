import "server-only";
import { revalidateTag } from "next/cache";

// Catalogue freshness. The public catalogue (search and browse, listing pages,
// seller pages, the marketplace numbers) is cached with `use cache` in
// src/lib/data/catalog.ts under the tags below. Whatever changes a listing or
// a seller calls catalogueChanged() once its transaction has committed, and
// the right cached pages are refreshed. Nothing else needs to know the tags.

/** The tags catalog.ts caches under. Only catalog.ts and this module use them. */
export const TAGS = {
  listings: "listings",
  listing: (id: string) => `listing-${id}`,
  seller: (id: string) => `seller-${id}`,
  stats: "stats",
} as const;

export type CatalogueChange = {
  /** Listings whose status, details or price changed; their seller's page shows them too. */
  listings?: { id: string; sellerId: string }[];
  /** Sellers whose public profile changed: name, verification, rating, sales, or all their listings at once. */
  sellers?: string[];
};

/**
 * Refresh the cached catalogue pages a change shows on. Call it after the
 * change has committed: refreshing earlier lets a visitor's request cache the
 * old data again. The next request for an affected page waits for fresh data,
 * including the page a Server Action returns, so the person who made the
 * change sees it at once. Works in Server Actions, route handlers and jobs.
 */
export function catalogueChanged({ listings = [], sellers = [] }: CatalogueChange) {
  if (listings.length === 0 && sellers.length === 0) return;
  // Every change can move what search, browse and the marketplace numbers show.
  const tags = new Set<string>([TAGS.listings, TAGS.stats]);
  for (const listing of listings) {
    tags.add(TAGS.listing(listing.id));
    tags.add(TAGS.seller(listing.sellerId));
  }
  // A seller's listing pages carry the seller tag too, so they refresh with it.
  for (const sellerId of sellers) tags.add(TAGS.seller(sellerId));
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
}
