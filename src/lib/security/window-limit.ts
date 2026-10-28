// In-memory fixed-window counter, for limits checked on requests too cheap to
// be worth a database write each (the shared, DB-backed limiter in
// rate-limit.ts is for sign-ins, checkouts and the like). Counts live in
// this server process: with several instances, each enforces the limit on
// its own share of the traffic.

export function createWindowLimiter({ limit, windowMs, maxKeys = 50_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return function hit(key: string, now = Date.now()) {
    let w = windows.get(key);
    if (!w || w.resetAt <= now) {
      if (windows.size >= maxKeys) {
        for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
        // Still full: many different addresses at once. Start over rather than grow without bound.
        if (windows.size >= maxKeys) windows.clear();
      }
      w = { count: 0, resetAt: now + windowMs };
      windows.set(key, w);
    }
    w.count++;
    return { ok: w.count <= limit, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  };
}
