import "server-only";
import { isLocale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { TAGS } from "@/lib/cache";
import { enqueueEmail } from "@/lib/email/outbox";
import { cancelOrderByAdmin, DomainError } from "@/lib/orders/service";
import { isBanned } from "@/lib/account/ban-state";
import type { BanLength } from "@/lib/constants";

export { isBanned };

// Banning an account. The account and everything it did are kept (unlike
// deletion), so the email can't simply sign up again and the record stays for
// disputes. While banned it can't sign in, its listings are hidden and
// payouts to it wait. A timed ban ends by itself (liftExpiredBans).

export { BAN_LENGTHS } from "@/lib/constants";

const localeOf = (value: string) => (isLocale(value) ? value : "id");

/**
 * Ban an account until `until` (null: permanently), or change how long an
 * existing ban lasts. Signs it out everywhere, hides its listings, and cancels
 * its orders that haven't shipped: a banned seller's are refunded, and a
 * banned buyer's unpaid ones released. Returns cache tags to invalidate.
 */
export async function banUser(adminId: string, userId: string, input: { until: Date | null; reason: string }, now = new Date()) {
  if (input.until && input.until <= now) throw new DomainError("banEndInPast");
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true, bannedAt: true, bannedUntil: true, locale: true, sellerProfile: { select: { id: true } } },
  });
  if (!user || user.deletedAt) throw new DomainError("banUnavailable");
  if (user.role === "ADMIN") throw new DomainError("banAdmin");
  const sellerId = user.sellerProfile?.id;

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      // An extended or shortened ban keeps the date it started.
      data: { bannedAt: isBanned(user, now) ? user.bannedAt : now, bannedUntil: input.until, banReason: input.reason },
    });
    await tx.session.deleteMany({ where: { userId } });
    if (sellerId) await tx.listing.updateMany({ where: { sellerId, status: "ACTIVE" }, data: { status: "SUSPENDED" } });
    await enqueueEmail(tx, { userId, locale: localeOf(user.locale) }, { template: "account-banned", params: { until: input.until?.toISOString() ?? null, reason: input.reason } });
  });

  // Orders that haven't shipped: one at a time, as each may call the payment provider.
  const open = await db.order.findMany({
    where: {
      OR: [
        ...(sellerId ? [{ sellerId, status: { in: ["PENDING_PAYMENT", "PAID"] } }] : []),
        { buyerId: userId, status: "PENDING_PAYMENT" },
      ],
    },
    select: { id: true },
  });
  const tags = new Set<string>([TAGS.listings, TAGS.stats, ...(sellerId ? [TAGS.seller(sellerId)] : [])]);
  let cancelled = 0;
  for (const o of open) {
    try {
      const result = await cancelOrderByAdmin(o.id, adminId);
      if (result) {
        cancelled++;
        result.tags.forEach((t) => tags.add(t));
      }
    } catch (err) {
      console.error("[ban] couldn't cancel order", o.id, err);
    }
  }
  // A cancelled order put its item back on sale: hide it too.
  if (sellerId) await db.listing.updateMany({ where: { sellerId, status: "ACTIVE" }, data: { status: "SUSPENDED" } });

  await audit(adminId, "user.ban", "User", userId, { until: input.until?.toISOString() ?? "permanent", reason: input.reason, cancelledOrders: cancelled });
  return { tags: [...tags], cancelled };
}

/** End a ban: early by an admin, or by the maintenance job when it runs out (adminId null). */
export async function unbanUser(adminId: string | null, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { bannedAt: true, locale: true, sellerProfile: { select: { id: true } } } });
  if (!user?.bannedAt) throw new DomainError("notBanned");
  const sellerId = user.sellerProfile?.id;
  await db.$transaction(async (tx) => {
    // Compare-and-swap, so an admin and the maintenance job lifting it together email once.
    const lifted = await tx.user.updateMany({ where: { id: userId, bannedAt: { not: null } }, data: { bannedAt: null, bannedUntil: null, banReason: null } });
    if (lifted.count !== 1) throw new DomainError("notBanned");
    if (sellerId) await tx.listing.updateMany({ where: { sellerId, status: "SUSPENDED" }, data: { status: "ACTIVE" } });
    await enqueueEmail(tx, { userId, locale: localeOf(user.locale) }, { template: "account-unbanned", params: {} });
  });
  await audit(adminId, adminId ? "user.unban" : "user.ban_ended", "User", userId);
  return { tags: [TAGS.listings, TAGS.stats, ...(sellerId ? [TAGS.seller(sellerId)] : [])] };
}

/** Lift timed bans whose end has passed. Run by the maintenance job. */
export async function liftExpiredBans(now = new Date()) {
  const due = await db.user.findMany({ where: { bannedAt: { not: null }, bannedUntil: { lte: now } }, select: { id: true }, take: 200 });
  const tags = new Set<string>();
  let lifted = 0;
  for (const u of due) {
    try {
      (await unbanUser(null, u.id)).tags.forEach((t) => tags.add(t));
      lifted++;
    } catch (err) {
      if (!(err instanceof DomainError && err.code === "notBanned")) console.error("[ban] couldn't lift ban", u.id, err);
    }
  }
  return { lifted, tags: [...tags] };
}

/** When a ban chosen in the admin form ends. Custom dates end at the start of that day, Jakarta time. */
export function banEnd(length: BanLength, customDate: string, now = new Date()): Date | null {
  if (length === "permanent") return null;
  if (length === "custom") {
    const end = /^\d{4}-\d{2}-\d{2}$/.test(customDate) ? new Date(`${customDate}T00:00:00+07:00`) : new Date(NaN);
    if (Number.isNaN(end.getTime())) throw new DomainError("banEndInPast");
    return end;
  }
  return new Date(now.getTime() + Number(length) * 86_400_000);
}
