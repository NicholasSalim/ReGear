// Kept apart from ban.ts (which pulls in the order service) so session checks stay light.

type BanFields = { bannedAt: Date | null; bannedUntil: Date | null };

/** Banned right now. A lapsed timed ban no longer counts, even before the maintenance job clears it. */
export function isBanned(user: BanFields, now = new Date()) {
  return !!user.bannedAt && (!user.bannedUntil || user.bannedUntil > now);
}
