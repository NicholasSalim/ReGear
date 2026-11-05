import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession } from "@/lib/auth/session";
import { isBanned } from "@/lib/account/ban-state";
import { getClientIp, getUserAgent } from "@/lib/security/request";
import type { Locale } from "@/i18n/locales";

// Sign-in completion. Each way of signing in proves who the person is in its
// own way (a password, a Google ID token, the code emailed at sign-up); what
// happens after that is the same for all of them and lives here, so an account
// check added here covers every way in.

/** How the person proved who they are. */
export type SignInMethod = "password" | "google" | "google_link" | "google_register" | "signup";

const AUDIT_ACTION: Record<SignInMethod, string> = {
  password: "user.login",
  google: "user.login_google",
  google_link: "user.link_google",
  google_register: "user.register_google",
  signup: "user.register",
};

export type SignInResult =
  /** Signed in; `home` is where to go when nothing else was asked for. */
  | { ok: true; home: "/admin" | "/account" }
  | { ok: false; reason: "locked" }
  | { ok: false; reason: "banned"; bannedUntil: Date | null };

/**
 * Sign in someone whose identity has just been proven: refuse a locked or
 * banned account, otherwise clear failed attempts, remember the language
 * their emails should use, start a session (setting its cookie) and record
 * the sign-in. Callers turn a refusal into their own message and redirect.
 */
export async function completeSignIn(
  userId: string,
  how: { method: SignInMethod; locale: Locale; auditMeta?: Record<string, unknown> },
  now = new Date(),
): Promise<SignInResult> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, lockedUntil: true, bannedAt: true, bannedUntil: true } });
  if (user.lockedUntil && user.lockedUntil > now) return { ok: false, reason: "locked" };
  if (isBanned(user, now)) return { ok: false, reason: "banned", bannedUntil: user.bannedUntil };

  // Any successful sign-in proves who they are, so earlier wrong passwords stop counting.
  await db.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil: null, locale: how.locale } });
  await createSession(userId, { ip: await getClientIp(), userAgent: await getUserAgent() });
  await audit(userId, AUDIT_ACTION[how.method], "User", userId, how.auditMeta);
  return { ok: true, home: user.role === "ADMIN" ? "/admin" : "/account" };
}
