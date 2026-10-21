import "server-only";
import { revalidateTag, updateTag } from "next/cache";

// Cache tag registry. Public catalogue data is cached with `use cache` and
// invalidated with these tags whenever a mutation touches it.
export const TAGS = {
  listings: "listings",
  listing: (id: string) => `listing-${id}`,
  seller: (id: string) => `seller-${id}`,
  stats: "stats",
} as const;

/**
 * Invalidate tags. Server Actions use updateTag (read-your-own-writes);
 * route handlers / background jobs fall back to revalidateTag with immediate expiry.
 */
export function invalidate(tags: string[], from: "action" | "route" = "action") {
  for (const tag of new Set(tags)) {
    if (from === "action") updateTag(tag);
    else revalidateTag(tag, { expire: 0 });
  }
}

export function listingTags(listing: { id: string; sellerId: string }) {
  return [TAGS.listings, TAGS.listing(listing.id), TAGS.seller(listing.sellerId), TAGS.stats];
}
