import { beforeEach, describe, expect, it } from "vitest";

const { db } = await import("@/lib/db");
const { rateLimit } = await import("@/lib/security/rate-limit");

describe("rate limiting", () => {
  beforeEach(async () => {
    await db.rateLimit.deleteMany();
  });

  it("lets exactly the limit through when requests arrive at once", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => rateLimit("login-email:race@test.dev", 10, 900)));
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    expect((await db.rateLimit.findUniqueOrThrow({ where: { key: "login-email:race@test.dev" } })).count).toBe(25);
  });

  it("starts a new window once the old one has expired", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("k", 2, 900);
    expect((await rateLimit("k", 2, 900)).ok).toBe(false);
    await db.rateLimit.update({ where: { key: "k" }, data: { resetAt: new Date(Date.now() - 1000) } });
    const fresh = await rateLimit("k", 2, 900);
    expect(fresh).toMatchObject({ ok: true, remaining: 1 });
    expect(fresh.retryAfterSec).toBeGreaterThan(890);
  });
});
