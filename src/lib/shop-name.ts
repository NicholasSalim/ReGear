import "server-only";
import { slugify } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";

// Shop names can't copy each other, so nobody can pass as a trusted shop.
// Capitals, accents, spaces and punctuation don't count: "Tech-Haven" is "techhaven".

export const shopNameKey = (name: string) => slugify(name).replace(/-/g, "");

/**
 * Whether another shop has this name. Holds a lock until the transaction ends,
 * so two shops claiming the same name at once can't both pass.
 */
export async function shopNameTaken(tx: Prisma.TransactionClient, name: string, exceptSellerId?: string) {
  const key = shopNameKey(name);
  if (!key) return false;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shop-names'))`;
  const shops = await tx.sellerProfile.findMany({ where: exceptSellerId ? { id: { not: exceptSellerId } } : {}, select: { displayName: true } });
  return shops.some((s) => shopNameKey(s.displayName) === key);
}
