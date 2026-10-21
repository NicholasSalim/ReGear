import "server-only";
import { db } from "@/lib/db";

// Fixed-window limiter persisted in the database so limits survive restarts
// and are shared between processes using the same DB.
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);

  const row = await db.$transaction(async (tx) => {
    const existing = await tx.rateLimit.findUnique({ where: { key } });
    if (!existing || existing.resetAt <= now) {
      return tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
    }
    return tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  });

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
