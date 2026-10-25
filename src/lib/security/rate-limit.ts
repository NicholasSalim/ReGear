import "server-only";
import { db } from "@/lib/db";

// Fixed-window limiter persisted in the database so limits survive restarts
// and are shared between processes using the same DB.
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);

  // One statement: concurrent requests each get their own count, and an
  // expired window restarts exactly once.
  const [row] = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;

  const remaining = Math.max(0, limit - row.count);
  return {
    ok: row.count <= limit,
    remaining,
    retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)),
  };
}

export async function purgeExpiredRateLimits() {
  await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
}
