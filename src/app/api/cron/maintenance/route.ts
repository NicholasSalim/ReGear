import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { invalidate } from "@/lib/cache";
import { runOrderMaintenance } from "@/lib/orders/service";
import { purgeExpiredRateLimits } from "@/lib/security/rate-limit";
import { deletePublicImage } from "@/lib/storage";

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

  return NextResponse.json({
    expiredOrders: result.expired,
    autoDelivered: result.autoDelivered,
    purgedSessions: sessions.count,
    purgedOrphanUploads: orphans.count,
  });
}
