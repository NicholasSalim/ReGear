import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { invalidate } from "@/lib/cache";
import { runOrderMaintenance } from "@/lib/orders/service";
import { runPayoutMaintenance } from "@/lib/payouts/service";
import { purgeExpiredRateLimits } from "@/lib/security/rate-limit";
import { deletePublicImage } from "@/lib/storage";
import { AUDIT_RETENTION_DAYS, EMAIL_LOG_RETENTION_DAYS } from "@/lib/legal";
import { deliverPendingEmails } from "@/lib/email/outbox";
import { runSavedSearchAlerts } from "@/lib/saved-searches";
import { liftExpiredBans } from "@/lib/account/ban";

// Periodic maintenance. Call from a scheduler (cron, systemd timer, platform
// cron) every ~5 minutes:  curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/cron/maintenance
function authorized(req: Request) {
  if (!env.CRON_SECRET) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runOrderMaintenance();
  invalidate(result.tags, "route");
  const withdrawals = await runPayoutMaintenance();
  // Timed bans that have run out: the account's listings go back on sale.
  const bans = await liftExpiredBans();
  invalidate(bans.tags, "route");

  const now = new Date();
  const [sessions] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    purgeExpiredRateLimits(),
  ]);
  // Photos uploaded but never attached to a listing are dropped after a day.
  const orphanRows = await db.upload.findMany({
    where: { listingId: null, createdAt: { lt: new Date(now.getTime() - 86_400_000) } },
    select: { id: true, key: true },
    take: 1000,
  });
  await Promise.all(orphanRows.map((o) => deletePublicImage(o.key)));
  const orphans = await db.upload.deleteMany({ where: { id: { in: orphanRows.map((o) => o.id) } } });
  // Security logs are kept as long as the Privacy Policy says, then dropped.
  const oldLogs = await db.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000) } } });
  // New listings for saved searches, queued before the send below.
  const searchAlerts = await runSavedSearchAlerts(now);
  // Emails: send what's due (including retries), then drop finished rows and old links.
  const emails = await deliverPendingEmails(200);
  const oldEmails = await db.emailOutbox.deleteMany({
    where: { status: { in: ["SENT", "SKIPPED", "FAILED"] }, createdAt: { lt: new Date(now.getTime() - EMAIL_LOG_RETENTION_DAYS * 86_400_000) } },
  });
  await db.emailToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } });
  // Sign-ups whose code was never entered (they hold a name, email and password hash).
  await db.signupRequest.deleteMany({ where: { expiresAt: { lt: now } } });

  return NextResponse.json({
    expiredOrders: result.expired,
    autoDelivered: result.autoDelivered,
    bansLifted: bans.lifted,
    ...withdrawals,
    purgedSessions: sessions.count,
    purgedOrphanUploads: orphans.count,
    purgedAuditLogs: oldLogs.count,
    searchAlerts,
    emailsSent: emails.sent,
    purgedEmails: oldEmails.count,
  });
}
