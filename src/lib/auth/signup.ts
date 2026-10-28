import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { isHttps } from "@/lib/env";
import { enqueueEmail } from "@/lib/email/outbox";
import { hashToken } from "@/lib/auth/session";
import type { Locale } from "@/i18n/locales";
import type { Prisma } from "@/generated/prisma/client";

// Sign-up by emailed code. Registering only creates a SignupRequest; the
// account is created, already confirmed, when the 6-digit code sent to the
// address is typed into the same browser. Someone using another person's
// address never sees the code, and the owner can't confirm it by accident
// (there's nothing to click), so nobody gets an account on an address they
// can't read.

export const SIGNUP_COOKIE = isHttps ? "__Host-regear_signup" : "regear_signup";
export const SIGNUP_TTL_MS = 15 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODE_SENDS = 5;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
// Tied to its request, so a code is only ever good for the sign-up it was sent for.
const hashCode = (requestId: string, code: string) => createHash("sha256").update(`${requestId}:${code}`).digest("hex");

function sameHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Email the request's address: a fresh code, or, if the address already has
 * an account, a note saying so. The sign-up screen looks the same either way,
 * so it can't be used to find out who is registered.
 */
async function sendCode(tx: Prisma.TransactionClient, request: { id: string; email: string; name: string; locale: string }) {
  const locale = request.locale as Locale;
  const existing = await tx.user.findUnique({ where: { email: request.email }, select: { id: true, deletedAt: true } });
  if (existing && !existing.deletedAt) {
    await tx.signupRequest.update({ where: { id: request.id }, data: { codeHash: null } });
    await enqueueEmail(tx, { userId: existing.id, to: request.email, locale }, { template: "signup-existing", params: {} });
    return;
  }
  const code = newCode();
  await tx.signupRequest.update({ where: { id: request.id }, data: { codeHash: hashCode(request.id, code) } });
  await enqueueEmail(tx, { to: request.email, locale }, { template: "signup-code", params: { code, name: request.name } });
}

/** Start a sign-up and email its code. Returns the token for this browser's cookie. */
export async function startSignup(data: { name: string; email: string; passwordHash: string; locale: Locale; termsVersion: string }) {
  const token = randomBytes(32).toString("base64url");
  const id = hashToken(token);
  await db.$transaction(async (tx) => {
    const request = await tx.signupRequest.create({ data: { id, ...data, expiresAt: new Date(Date.now() + SIGNUP_TTL_MS) } });
    await sendCode(tx, request);
  });
  return token;
}

/** Send a new code for the same sign-up (the old one stops working). False once the request is gone or used up. */
export async function resendSignupCode(token: string) {
  if (!TOKEN_RE.test(token)) return false;
  return db.$transaction(async (tx) => {
    const request = await tx.signupRequest.findUnique({ where: { id: hashToken(token) } });
    if (!request || request.expiresAt <= new Date() || request.sends >= MAX_CODE_SENDS) return false;
    await tx.signupRequest.update({
      where: { id: request.id },
      data: { attempts: 0, sends: { increment: 1 }, expiresAt: new Date(Date.now() + SIGNUP_TTL_MS) },
    });
    await sendCode(tx, request);
    return true;
  });
}

/** The sign-up this browser is in the middle of, if it's still open. */
export async function currentSignup() {
  const token = (await cookies()).get(SIGNUP_COOKIE)?.value;
  if (!token || !TOKEN_RE.test(token)) return null;
  const request = await db.signupRequest.findUnique({ where: { id: hashToken(token) }, select: { email: true, expiresAt: true, attempts: true, sends: true } });
  if (!request || request.expiresAt <= new Date() || request.attempts >= MAX_CODE_ATTEMPTS) return null;
  return { token, ...request };
}

export type ConfirmResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "wrong"; attemptsLeft: number }
  | { ok: false; reason: "expired" | "exists" };

/**
 * Check the code. The right one creates the account (confirmed) and closes
 * every open sign-up for that address; five wrong ones close this sign-up.
 */
export async function confirmSignup(token: string, code: string): Promise<ConfirmResult> {
  if (!TOKEN_RE.test(token)) return { ok: false, reason: "expired" };
  return db.$transaction(async (tx) => {
    // Lock the row so two guesses at once can't both count as the fifth.
    const [request] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SignupRequest" WHERE "id" = ${hashToken(token)} FOR UPDATE`;
    const row = request ? await tx.signupRequest.findUnique({ where: { id: request.id } }) : null;
    if (!row || row.expiresAt <= new Date() || row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, reason: "expired" };

    if (!row.codeHash || !/^\d{6}$/.test(code) || !sameHash(hashCode(row.id, code), row.codeHash)) {
      const attempts = row.attempts + 1;
      await tx.signupRequest.update({ where: { id: row.id }, data: { attempts } });
      if (attempts >= MAX_CODE_ATTEMPTS) return { ok: false, reason: "expired" };
      return { ok: false, reason: "wrong", attemptsLeft: MAX_CODE_ATTEMPTS - attempts };
    }

    // Someone may have created the account meanwhile (another sign-up, or Google).
    if (await tx.user.findUnique({ where: { email: row.email }, select: { id: true } })) {
      await tx.signupRequest.deleteMany({ where: { email: row.email } });
      return { ok: false, reason: "exists" };
    }
    const now = new Date();
    const user = await tx.user.create({
      data: {
        email: row.email,
        name: row.name,
        passwordHash: row.passwordHash,
        locale: row.locale,
        termsVersion: row.termsVersion,
        termsAcceptedAt: row.createdAt,
        emailVerifiedAt: now,
      },
      select: { id: true },
    });
    await tx.signupRequest.deleteMany({ where: { email: row.email } });
    return { ok: true, userId: user.id };
  });
}

export async function setSignupCookie(token: string) {
  (await cookies()).set(SIGNUP_COOKIE, token, { httpOnly: true, secure: isHttps, sameSite: "lax", path: "/", maxAge: SIGNUP_TTL_MS / 1000 * MAX_CODE_SENDS });
}

export async function clearSignupCookie() {
  (await cookies()).delete(SIGNUP_COOKIE);
}
