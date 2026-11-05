import { beforeEach, describe, expect, it, vi } from "vitest";

const setCookie = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "test-agent" }),
  cookies: async () => ({ get: () => undefined, set: setCookie, delete: vi.fn() }),
}));

const { db } = await import("@/lib/db");
const { completeSignIn } = await import("@/lib/auth/sign-in");

const EMAIL = "pat@sign-in.test";

describe("sign-in completion", () => {
  let userId: string;
  beforeEach(async () => {
    setCookie.mockClear();
    await db.session.deleteMany({ where: { user: { email: { endsWith: "@sign-in.test" } } } });
    const old = await db.user.findMany({ where: { email: { endsWith: "@sign-in.test" } }, select: { id: true } });
    await db.auditLog.deleteMany({ where: { entityId: { in: old.map((u) => u.id) } } });
    await db.user.deleteMany({ where: { email: { endsWith: "@sign-in.test" } } });
    const user = await db.user.create({
      data: { email: EMAIL, name: "Pat", passwordHash: "x", emailVerifiedAt: new Date(), locale: "id", failedLoginCount: 3 },
    });
    userId = user.id;
  });

  const sessions = () => db.session.count({ where: { userId } });
  const auditActions = async () => (await db.auditLog.findMany({ where: { entityId: userId }, select: { action: true, meta: true } })).map((a) => a);

  it("signs in: clears failed attempts, remembers the language, starts a session and records it", async () => {
    expect(await completeSignIn(userId, { method: "password", locale: "en" })).toEqual({ ok: true, home: "/account" });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ failedLoginCount: 0, lockedUntil: null, locale: "en" });
    expect(await sessions()).toBe(1);
    expect(setCookie).toHaveBeenCalledTimes(1);
    expect((await auditActions()).map((a) => a.action)).toEqual(["user.login"]);
  });

  it("sends admins to the admin area", async () => {
    await db.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    expect(await completeSignIn(userId, { method: "password", locale: "en" })).toEqual({ ok: true, home: "/admin" });
  });

  it("records how the person signed in, the same way as before", async () => {
    await completeSignIn(userId, { method: "google", locale: "en" });
    await completeSignIn(userId, { method: "google_link", locale: "en", auditMeta: { passwordCleared: true } });
    await completeSignIn(userId, { method: "google_register", locale: "en" });
    await completeSignIn(userId, { method: "signup", locale: "en" });
    const actions = await auditActions();
    expect(actions.map((a) => a.action).sort()).toEqual(["user.link_google", "user.login_google", "user.register", "user.register_google"]);
    expect(JSON.parse(actions.find((a) => a.action === "user.link_google")!.meta)).toEqual({ passwordCleared: true });
  });

  it("refuses a locked account, whichever way it signs in", async () => {
    const lockedUntil = new Date(Date.now() + 600_000);
    await db.user.update({ where: { id: userId }, data: { lockedUntil } });
    expect(await completeSignIn(userId, { method: "google", locale: "en" })).toEqual({ ok: false, reason: "locked" });
    expect(await sessions()).toBe(0);
    // Nothing about the account changes on a refusal.
    expect(await db.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ failedLoginCount: 3, lockedUntil, locale: "id" });
  });

  it("refuses a banned account with when the ban ends, but not once a timed ban has run out", async () => {
    const bannedUntil = new Date(Date.now() + 86_400_000);
    await db.user.update({ where: { id: userId }, data: { bannedAt: new Date(), bannedUntil, banReason: "Fakes" } });
    expect(await completeSignIn(userId, { method: "password", locale: "en" })).toEqual({ ok: false, reason: "banned", bannedUntil });
    await db.user.update({ where: { id: userId }, data: { bannedUntil: null } });
    expect(await completeSignIn(userId, { method: "google", locale: "en" })).toEqual({ ok: false, reason: "banned", bannedUntil: null });
    expect(await sessions()).toBe(0);

    await db.user.update({ where: { id: userId }, data: { bannedUntil: new Date(Date.now() - 1000) } });
    expect((await completeSignIn(userId, { method: "password", locale: "en" })).ok).toBe(true);
  });
});
