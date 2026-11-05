// Kept apart from ban.ts (which pulls in the order service) so session checks stay light.
import type { Prisma } from "@/generated/prisma/client";

type BanFields = { bannedAt: Date | null; bannedUntil: Date | null };

/** Banned right now. A lapsed timed ban no longer counts, even before the maintenance job clears it. */
export function isBanned(user: BanFields, now = new Date()) {
  return !!user.bannedAt && (!user.bannedUntil || user.bannedUntil > now);
}

/** The same rule as isBanned, as a database filter: accounts banned right now. */
export function bannedNowWhere(now = new Date()) {
  return { bannedAt: { not: null }, OR: [{ bannedUntil: null }, { bannedUntil: { gt: now } }] } satisfies Prisma.UserWhereInput;
}
