import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Changes a listing only while it's a draft or on sale, in one statement.
 * Checkout reserves a listing the same way, so a seller's save can't put a
 * listing back on sale after a buyer reserved it. False if it's no longer open.
 */
export async function updateOpenListing(client: Prisma.TransactionClient | typeof db, id: string, data: Prisma.ListingUpdateManyMutationInput) {
  const updated = await client.listing.updateMany({ where: { id, status: { in: ["DRAFT", "ACTIVE"] } }, data });
  return updated.count === 1;
}
