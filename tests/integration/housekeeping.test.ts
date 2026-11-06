import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Storage really deletes, except for keys listed here, which act as if storage couldn't be reached.
const unreachable = new Set<string>();
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, deletePublicImage: async (key: string) => (unreachable.has(key) ? false : actual.deletePublicImage(key)) };
});

const { db } = await import("@/lib/db");
const storage = await import("@/lib/storage");
const { runHousekeeping } = await import("@/lib/housekeeping");
const { AUDIT_RETENTION_DAYS, EMAIL_LOG_RETENTION_DAYS, ORPHAN_UPLOAD_DAYS } = await import("@/lib/legal");

const NOW = new Date("2026-06-15T12:00:00Z");
const DAY = 86_400_000;
const MINUTE = 60_000;
/** Just inside a period (kept) and just past it (deleted). */
const kept = (days: number) => new Date(NOW.getTime() - days * DAY + MINUTE);
const gone = (days: number) => new Date(NOW.getTime() - days * DAY - MINUTE);
const later = new Date(NOW.getTime() + MINUTE);
const earlier = new Date(NOW.getTime() - MINUTE);

const image = () => sharp({ create: { width: 300, height: 300, channels: 3, background: "#3d5af0" } }).png().toBuffer();

let userId: string;

beforeEach(async () => {
  unreachable.clear();
  await db.$transaction([
    db.session.deleteMany(),
    db.rateLimit.deleteMany(),
    db.upload.deleteMany(),
    db.auditLog.deleteMany(),
    db.emailOutbox.deleteMany(),
    db.emailToken.deleteMany(),
    db.signupRequest.deleteMany(),
  ]);
  const user = await db.user.upsert({
    where: { email: "housekeeping@test.dev" },
    update: {},
    create: { email: "housekeeping@test.dev", name: "Keeper", passwordHash: "x", emailVerifiedAt: new Date() },
  });
  userId = user.id;
});

async function photo(createdAt: Date, listingId: string | null = null) {
  const saved = await storage.savePublicImage(await image());
  await db.upload.create({ data: { ownerId: userId, listingId, key: saved.key, width: 40, height: 40, bytes: 1, createdAt } });
  return saved.key;
}

describe("housekeeping", () => {
  it("ends sign-ins and attempt counters once they've expired", async () => {
    await db.session.createMany({ data: [{ id: "old", userId, expiresAt: earlier }, { id: "live", userId, expiresAt: later }] });
    await db.rateLimit.createMany({ data: [{ key: "old", count: 1, resetAt: earlier }, { key: "live", count: 1, resetAt: later }] });

    const result = await runHousekeeping(NOW);

    expect(result).toMatchObject({ sessions: 1, rateLimits: 1 });
    expect((await db.session.findMany()).map((s) => s.id)).toEqual(["live"]);
    expect((await db.rateLimit.findMany()).map((r) => r.key)).toEqual(["live"]);
  });

  it("deletes photos never used in a listing once their period is over, file and all", async () => {
    const stale = await photo(gone(ORPHAN_UPLOAD_DAYS));
    const fresh = await photo(kept(ORPHAN_UPLOAD_DAYS));

    const result = await runHousekeeping(NOW);

    expect(result).toMatchObject({ photos: 1, photosToRetry: 0 });
    expect((await db.upload.findMany()).map((u) => u.key)).toEqual([fresh]);
    expect(await storage.readPublicImage(stale)).toBeNull();
    expect(await storage.readPublicImage(fresh)).not.toBeNull();
  });

  it("keeps a photo storage couldn't delete, and deletes it on a later run", async () => {
    const key = await photo(gone(ORPHAN_UPLOAD_DAYS));
    unreachable.add(key);

    expect(await runHousekeeping(NOW)).toMatchObject({ photos: 0, photosToRetry: 1 });
    expect(await db.upload.count()).toBe(1);

    unreachable.clear();
    expect(await runHousekeeping(NOW)).toMatchObject({ photos: 1, photosToRetry: 0 });
    expect(await db.upload.count()).toBe(0);
    expect(await storage.readPublicImage(key)).toBeNull();
  });

  it("keeps security records and the email log for their periods", async () => {
    await db.auditLog.createMany({
      data: [
        { action: "old", entity: "x", entityId: "1", createdAt: gone(AUDIT_RETENTION_DAYS) },
        { action: "kept", entity: "x", entityId: "2", createdAt: kept(AUDIT_RETENTION_DAYS) },
      ],
    });
    await db.emailOutbox.createMany({
      data: [
        { to: "a@test.dev", template: "t", status: "SENT", createdAt: gone(EMAIL_LOG_RETENTION_DAYS) },
        { to: "a@test.dev", template: "t", status: "FAILED", createdAt: gone(EMAIL_LOG_RETENTION_DAYS) },
        { to: "a@test.dev", template: "t", status: "SENT", createdAt: kept(EMAIL_LOG_RETENTION_DAYS) },
        // Still waiting to go out: kept whatever its age.
        { to: "a@test.dev", template: "t", status: "PENDING", createdAt: gone(EMAIL_LOG_RETENTION_DAYS) },
      ],
    });

    const result = await runHousekeeping(NOW);

    expect(result).toMatchObject({ auditLogs: 1, emailLog: 2 });
    expect((await db.auditLog.findMany()).map((a) => a.action)).toEqual(["kept"]);
    expect((await db.emailOutbox.findMany({ orderBy: { status: "asc" } })).map((e) => e.status)).toEqual(["PENDING", "SENT"]);
  });

  it("forgets one-time links once used or expired, and sign-ups never finished", async () => {
    await db.emailToken.createMany({
      data: [
        { userId, purpose: "VERIFY_EMAIL", tokenHash: "expired", expiresAt: earlier },
        { userId, purpose: "VERIFY_EMAIL", tokenHash: "used", expiresAt: later, usedAt: earlier },
        { userId, purpose: "VERIFY_EMAIL", tokenHash: "open", expiresAt: later },
      ],
    });
    const signup = { name: "N", passwordHash: "x", locale: "en", termsVersion: "1" };
    await db.signupRequest.createMany({
      data: [
        { id: "old", email: "o@test.dev", expiresAt: earlier, ...signup },
        { id: "open", email: "p@test.dev", expiresAt: later, ...signup },
      ],
    });

    const result = await runHousekeeping(NOW);

    expect(result).toMatchObject({ emailLinks: 2, signups: 1 });
    expect((await db.emailToken.findMany()).map((t) => t.tokenHash)).toEqual(["open"]);
    expect((await db.signupRequest.findMany()).map((s) => s.id)).toEqual(["open"]);
  });
});
