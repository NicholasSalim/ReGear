import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));

const { db } = await import("@/lib/db");
const { mailboxBanned, mailboxKey } = await import("@/lib/account/mailbox");
const { confirmSignup, startSignup } = await import("@/lib/auth/signup");
const { findOrCreateGoogleUser, MailboxBannedError } = await import("@/lib/auth/google");

const DOMAIN = "@gmail.com";
const BANNED = `ban.ned+shop${DOMAIN}`;

async function signUp(email: string) {
  return startSignup({ name: "New Person", email, passwordHash: "x", locale: "en", termsVersion: "test" });
}
const lastEmailTo = (to: string) => db.emailOutbox.findFirstOrThrow({ where: { to }, orderBy: { createdAt: "desc" } });

describe("mailboxKey", () => {
  it("drops +tags everywhere, and Gmail's dots", () => {
    expect(mailboxKey("Pat+shop@Example.com")).toBe("pat@example.com");
    expect(mailboxKey("p.a.t+1+2@gmail.com")).toBe("pat@gmail.com");
    expect(mailboxKey("p.a.t@googlemail.com")).toBe("pat@gmail.com");
    // Dots matter at other providers.
    expect(mailboxKey("p.a.t@outlook.com")).toBe("p.a.t@outlook.com");
  });
});

describe("signing up again on a banned inbox", () => {
  let bannedId: string;
  beforeEach(async () => {
    await db.signupRequest.deleteMany();
    await db.emailOutbox.deleteMany();
    await db.oAuthAccount.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    const user = await db.user.create({
      data: { email: BANNED, mailbox: mailboxKey(BANNED), name: "Banned", passwordHash: "x", bannedAt: new Date(), banReason: "Fakes" },
    });
    bannedId = user.id;
  });

  it("sends no code to another address of the same inbox", async () => {
    const alias = `banned+again${DOMAIN}`;
    await signUp(alias);
    const mail = await lastEmailTo(alias);
    expect(mail.template).toBe("signup-blocked");
    expect(JSON.parse(mail.params)).toEqual({});
  });

  it("refuses a code sent before the ban", async () => {
    const alias = `b.anned${DOMAIN}`;
    await db.user.update({ where: { id: bannedId }, data: { bannedAt: null } });
    const token = await signUp(alias);
    const { code } = JSON.parse((await lastEmailTo(alias)).params) as { code: string };
    await db.user.update({ where: { id: bannedId }, data: { bannedAt: new Date() } });

    expect(await confirmSignup(token, code)).toEqual({ ok: false, reason: "blocked" });
    expect(await db.user.count({ where: { email: alias } })).toBe(0);
  });

  it("refuses a new Google account on the inbox, but not once the ban is over", async () => {
    const claims = { sub: "g-1", email: `banned${DOMAIN}`, email_verified: true, name: "Again" };
    await expect(findOrCreateGoogleUser(claims)).rejects.toThrow(MailboxBannedError);

    await db.user.update({ where: { id: bannedId }, data: { bannedUntil: new Date(Date.now() - 1000) } });
    expect(await mailboxBanned(db, claims.email)).toBe(false);
    const { user, created } = await findOrCreateGoogleUser(claims);
    expect(created).toBe(true);
    expect(user.mailbox).toBe(`banned${DOMAIN}`);
  });

  it("ignores a banned account once it's deleted", async () => {
    await db.user.update({ where: { id: bannedId }, data: { deletedAt: new Date() } });
    const alias = `banned+new${DOMAIN}`;
    await signUp(alias);
    expect((await lastEmailTo(alias)).template).toBe("signup-code");
  });
});
