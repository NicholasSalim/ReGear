import "server-only";
import { db } from "@/lib/db";
import { deletePublicImage } from "@/lib/storage";
import { AUDIT_RETENTION_DAYS, EMAIL_LOG_RETENTION_DAYS, ORPHAN_UPLOAD_DAYS } from "@/lib/legal";

// Housekeeping: deleting what ReGear no longer needs, on the schedule the
// Privacy Policy promises (the periods live in src/lib/legal.ts, which the
// policy text reads too). Run by the maintenance job.

const DAY_MS = 86_400_000;
/** At most this many unused photos are removed per run; the rest go next time. */
const PHOTOS_PER_RUN = 1000;

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

export async function runHousekeeping(now = new Date()) {
  // Sign-ins that have ended, and attempt counters whose window has passed.
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const rateLimits = await db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });

  // Photos uploaded but never attached to a listing. A file storage couldn't
  // delete keeps its row, so it's tried again next run instead of being
  // forgotten while the file stays.
  const unused = await db.upload.findMany({
    where: { listingId: null, createdAt: { lt: daysBefore(now, ORPHAN_UPLOAD_DAYS) } },
    select: { id: true, key: true },
    take: PHOTOS_PER_RUN,
  });
  const removed = await Promise.all(unused.map(async (u) => ((await deletePublicImage(u.key)) ? u.id : null)));
  const removedIds = removed.filter((id): id is string => id !== null);
  const photos = await db.upload.deleteMany({ where: { id: { in: removedIds } } });

  // Security records and the record of sent emails, once their period is over.
  const auditLogs = await db.auditLog.deleteMany({ where: { createdAt: { lt: daysBefore(now, AUDIT_RETENTION_DAYS) } } });
  const emailLog = await db.emailOutbox.deleteMany({
    // Emails still waiting to go out are kept whatever their age.
    where: { status: { in: ["SENT", "SKIPPED", "FAILED"] }, createdAt: { lt: daysBefore(now, EMAIL_LOG_RETENTION_DAYS) } },
  });
  // One-time links once used or expired, and sign-ups whose code was never entered (they hold a name, email and password hash).
  const emailLinks = await db.emailToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } });
  const signups = await db.signupRequest.deleteMany({ where: { expiresAt: { lt: now } } });

  return {
    sessions: sessions.count,
    rateLimits: rateLimits.count,
    photos: photos.count,
    photosToRetry: unused.length - removedIds.length,
    auditLogs: auditLogs.count,
    emailLog: emailLog.count,
    emailLinks: emailLinks.count,
    signups: signups.count,
  };
}
