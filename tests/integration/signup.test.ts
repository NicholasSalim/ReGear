import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));

const { db } = await import("@/lib/db");
const { confirmSignup, resendSignupCode, startSignup, MAX_CODE_ATTEMPTS } = await import("@/lib/auth/signup");
const { validateSessionToken, hashToken } = await import("@/lib/auth/session");
const { hashPassword } = await import("@/lib/auth/password");

const EMAIL = "new.person@signup.test";

async function signUp(email = EMAIL) {
  return startSignup({ name: "New Person", email, passwordHash: await hashPassword("Pass-word-1"), locale: "en", termsVersion: "test" });
}

/** The code in the newest email to this address (as the inbox owner would read it). */
async function codeSentTo(email = EMAIL) {
  const row = await db.emailOutbox.findFirstOrThrow({ where: { to: email }, orderBy: { createdAt: "desc" } });
  return { template: row.template, code: (JSON.parse(row.params) as { code?: string }).code };
}

describe("sign-up by emailed code", () => {
  beforeEach(async () => {
    await db.signupRequest.deleteMany();
    await db.emailOutbox.deleteMany({ where: { to: { endsWith: "@signup.test" } } });
    await db.session.deleteMany({ where: { user: { email: { endsWith: "@signup.test" } } } });
    await db.user.deleteMany({ where: { email: { endsWith: "@signup.test" } } });
  });

  it("creates no account until the code is entered, then a confirmed one", async () => {
    const token = await signUp();
    expect(await db.user.count({ where: { email: EMAIL } })).toBe(0);
    const { template, code } = await codeSentTo();
    expect(template).toBe("signup-code");
    expect(code).toMatch(/^\d{6}$/);

    const result = await confirmSignup(token, code!);
    expect(result.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await db.signupRequest.count()).toBe(0);
    expect((await confirmSignup(token, code!)).ok).toBe(false); // used up
  });

  it("only accepts the code from the browser that signed up", async () => {
    await signUp();
    const { code } = await codeSentTo();
    // Another browser (an attacker who read nothing, or the owner clicking around) has no sign-up token.
    expect(await confirmSignup("A".repeat(43), code!)).toEqual({ ok: false, reason: "expired" });
    expect(await db.user.count({ where: { email: EMAIL } })).toBe(0);
  });

  it("closes the sign-up after too many wrong codes", async () => {
    const token = await signUp();
    const { code } = await codeSentTo();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let left = MAX_CODE_ATTEMPTS - 1; left > 0; left--) {
      expect(await confirmSignup(token, wrong)).toEqual({ ok: false, reason: "wrong", attemptsLeft: left });
    }
    expect(await confirmSignup(token, wrong)).toEqual({ ok: false, reason: "expired" });
    expect(await confirmSignup(token, code!)).toEqual({ ok: false, reason: "expired" }); // even the right one, now
  });

  it("a new code replaces the old one", async () => {
    const token = await signUp();
    const first = (await codeSentTo()).code!;
    expect(await resendSignupCode(token)).toBe(true);
    const second = (await codeSentTo()).code!;
    if (first !== second) expect((await confirmSignup(token, first)).ok).toBe(false);
    expect((await confirmSignup(token, second)).ok).toBe(true);
  });

  it("tells an existing account's address instead of sending a code, and never creates a second account", async () => {
    await db.user.create({ data: { email: EMAIL, name: "Owner", passwordHash: await hashPassword("Owner-pass-1"), emailVerifiedAt: new Date() } });
    const token = await signUp();
    const sent = await codeSentTo();
    expect(sent).toEqual({ template: "signup-existing", code: undefined });
    for (const guess of ["000000", "123456"]) expect((await confirmSignup(token, guess)).ok).toBe(false);
    expect(await db.user.count({ where: { email: EMAIL } })).toBe(1);
  });

  it("doesn't let a session of an unconfirmed account sign anyone in", async () => {
    const user = await db.user.create({ data: { email: "legacy@signup.test", name: "Legacy", passwordHash: await hashPassword("Legacy-pass-1") } });
    await db.session.create({ data: { id: hashToken("t".repeat(43)), userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    expect(await validateSessionToken("t".repeat(43))).toBeNull();
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    expect(await validateSessionToken("t".repeat(43))).not.toBeNull();
  });
});
