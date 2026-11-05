"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { localePath } from "@/i18n/locales";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalidate, TAGS } from "@/lib/cache";
import { LEGAL_VERSION } from "@/lib/legal";
import { issueEmailToken, resetPasswordWithToken } from "@/lib/auth/email-tokens";
import { clearSignupCookie, confirmSignup, currentSignup, resendSignupCode, setSignupCookie, startSignup } from "@/lib/auth/signup";
import { enqueueEmail } from "@/lib/email/outbox";
import { siteUrl } from "@/lib/email/templates";
import type { Locale } from "@/i18n/locales";
import { deleteAccount, getDeletionBlockers, isBlocked } from "@/lib/account/delete";
import { actionI18n, formToObject, runAction, type ActionState } from "@/lib/action";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyAllSessions, destroyCurrentSession, readSessionToken, renewSessionIfNeeded } from "@/lib/auth/session";
import { getCurrentUser, requireUserStrict } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp, getUserAgent, safeRedirectPath } from "@/lib/security/request";
import { isBanned } from "@/lib/account/ban-state";
import { formatDateTime } from "@/lib/format";
import { changePasswordSchema, fieldErrors, forgotPasswordSchema, loginSchema, profileSchema, registerSchema, resetPasswordSchema } from "@/lib/validation";

/** Email a password reset link (also how an account whose email was never confirmed gets confirmed). */
async function sendResetLink(user: { id: string; email: string; name: string }, locale: Locale) {
  await db.$transaction(async (tx) => {
    const token = await issueEmailToken(tx, user.id, "RESET_PASSWORD");
    const url = `${siteUrl("/reset-password", locale)}?token=${token}`;
    await enqueueEmail(tx, { userId: user.id, to: user.email, locale }, { template: "reset-password", params: { url, name: user.name } });
  });
}

const LOCK_AFTER_FAILURES = 5;
const LOCK_MINUTES = 15;
const LOGIN_EMAIL_LIMIT = 10;

/**
 * Starts a sign-up: emails a code and asks for it. No account exists until
 * the code is entered (see lib/auth/signup.ts). The answer is the same
 * whether or not the email is already registered.
 */
export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, t } = await actionI18n();
  const ip = await getClientIp();
  const parsed = registerSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error, t, locale) };
  const { name, email, password } = parsed.data;

  // Each sign-up allows 5 code guesses, so the per-address caps bound how fast
  // anyone can guess a code for an address they can't read (50 a day at most).
  const [byIp, byEmail, byEmailDay] = await Promise.all([
    rateLimit(`register:${ip}`, 10, 3600),
    rateLimit(`register-email:${email}`, 5, 3600),
    rateLimit(`register-email-day:${email}`, 10, 86_400),
  ]);
  if (!byIp.ok || !byEmail.ok || !byEmailDay.ok) return { error: t.actions.signupLimit };

  const token = await startSignup({ name, email, passwordHash: await hashPassword(password), locale, termsVersion: LEGAL_VERSION });
  await setSignupCookie(token);
  const next = safeRedirectPath(formData.get("next"), "");
  redirect(`${localePath("/register/confirm", locale)}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
}

/** The code from the sign-up email: creates the account and signs in. */
export async function confirmSignupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, t } = await actionI18n();
  const ip = await getClientIp();
  const limited = await rateLimit(`signup-code:${ip}`, 30, 900);
  if (!limited.ok) return { error: t.actions.signupLimit };

  const signup = await currentSignup();
  if (!signup) return { error: t.actions.codeExpired };
  // Not a 6-digit code can't be right: say so without using up one of the five guesses.
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { fieldErrors: { code: t.actions.codeFormat } };
  const result = await confirmSignup(signup.token, code);
  if (!result.ok) {
    if (result.reason === "wrong") return { fieldErrors: { code: t.actions.codeWrong(result.attemptsLeft) } };
    await clearSignupCookie();
    // The confirm page can't show without the cookie, so the explanation travels with the redirect.
    const next = String(formData.get("next") ?? "");
    const target =
      result.reason === "exists" ? `/login?error=signup_exists` : result.reason === "blocked" ? `/register?error=mailbox_banned` : `/register?error=signup_expired`;
    redirect(`${localePath(target, locale)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  await clearSignupCookie();
  await createSession(result.userId, { ip, userAgent: await getUserAgent() });
  await audit(result.userId, "user.register", "User", result.userId);
  redirect(safeRedirectPath(formData.get("next"), localePath("/account", locale)));
}

/** Emails a new code for the sign-up in progress. */
export async function resendSignupCodeAction(_prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  const { t } = await actionI18n();
  const limited = await rateLimit(`signup-resend:${await getClientIp()}`, 10, 3600);
  if (!limited.ok) return { error: t.actions.codeResendWait };
  const signup = await currentSignup();
  if (!signup || !(await resendSignupCode(signup.token))) return { error: t.actions.codeResendLimit };
  return { ok: true, message: t.actions.codeResent };
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, t } = await actionI18n();
  const ip = await getClientIp();
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error, t, locale) };
  const { email, password } = parsed.data;

  const [byIp, byEmail] = await Promise.all([rateLimit(`login-ip:${ip}`, 30, 900), rateLimit(`login-email:${email}`, LOGIN_EMAIL_LIMIT, 900)]);
  if (!byIp.ok || !byEmail.ok) return { error: t.actions.loginLimit };

  const generic = { error: t.actions.badCredentials };
  const user = await db.user.findUnique({ where: { email } });
  // Google-only accounts have no password; answer exactly like an unknown email.
  if (!user || !user.passwordHash) {
    // Equalise timing so attackers cannot enumerate registered emails.
    await verifyPassword(password, await getDummyHash());
    // A real account says "locked" from the attempt after its LOCK_AFTER_FAILURES-th
    // failure; say the same here, or the message would reveal which emails exist.
    const attempts = LOGIN_EMAIL_LIMIT - byEmail.remaining;
    return attempts > LOCK_AFTER_FAILURES ? { error: t.actions.locked } : generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: t.actions.locked };
  }

  const { ok, needsRehash } = await verifyPassword(password, user.passwordHash);
  if (ok && !user.emailVerifiedAt) {
    // Made before sign-up needed a code, and never confirmed. Whoever set this
    // password may not own the address, so it doesn't get in: the address
    // gets a reset link instead, and setting a password from it confirms it.
    const resend = await rateLimit(`confirm-first:${user.id}`, 3, 3600);
    if (resend.ok) await sendResetLink(user, locale);
    return { error: t.actions.confirmEmailFirst };
  }
  if (!ok) {
    const failures = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failures >= LOCK_AFTER_FAILURES ? 0 : failures,
        lockedUntil: failures >= LOCK_AFTER_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    if (failures >= LOCK_AFTER_FAILURES) await audit(user.id, "user.locked", "User", user.id);
    return generic;
  }
  // Said only after the right password, so it doesn't reveal who is banned.
  if (isBanned(user)) return { error: t.actions.accountBanned(user.bannedUntil ? formatDateTime(user.bannedUntil, locale) : null) };

  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      // Emails follow the language the user last signed in with.
      locale,
      ...(needsRehash ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  await createSession(user.id, { ip, userAgent: await getUserAgent() });
  await audit(user.id, "user.login", "User", user.id);
  redirect(safeRedirectPath(formData.get("next"), localePath(user.role === "ADMIN" ? "/admin" : "/account", locale)));
}

export async function logoutAction() {
  const { locale } = await actionI18n();
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) await audit(user.id, "user.logout", "User", user.id);
  redirect(localePath("/", locale));
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    const { name } = profileSchema.parse(formToObject(formData));
    await db.user.update({ where: { id: user.id }, data: { name } });
    const token = await readSessionToken();
    if (token) await renewSessionIfNeeded(token, user.sessionExpiresAt);
    // The header shows the name; re-render the page with it.
    refresh();
    return { ok: true, message: t.actions.profileUpdated };
  });
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    // Checked first, so a mistyped new password doesn't use up an attempt:
    // the limit is on guessing the current one.
    const data = changePasswordSchema.parse(formToObject(formData));
    const limited = await rateLimit(`pwchange:${user.id}`, 5, 900);
    if (!limited.ok) return { error: t.actions.passwordLimit };
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    // Accounts created with Google can add a first password without one.
    if (row.passwordHash) {
      const { ok } = await verifyPassword(data.currentPassword, row.passwordHash);
      if (!ok) return { fieldErrors: { currentPassword: t.actions.currentPasswordWrong } };
    }

    // Rotating the password invalidates every existing session, then we
    // issue a fresh one for this device.
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.newPassword), passwordChangedAt: new Date() },
    });
    await destroyAllSessions(user.id);
    await createSession(user.id, { ip: await getClientIp(), userAgent: await getUserAgent() });
    await audit(user.id, "user.password_changed", "User", user.id);
    // A first password changes the form (it now asks for the current one).
    refresh();
    return { ok: true, message: row.passwordHash ? t.actions.passwordChanged : t.actions.passwordSet };
  });
}

/**
 * Deletes the signed-in user's account after they confirm with their email
 * (and password, if they have one). Refused while any order is still open.
 */
export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(async (): Promise<ActionState | void> => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    const limited = await rateLimit(`delete-account:${user.id}`, 5, 900);
    if (!limited.ok) return { error: t.actions.deleteLimit };

    const blockers = await getDeletionBlockers(user.id);
    if (blockers.admin) return { error: t.domain.adminAccount };
    if (blockers.balance) return { error: t.domain.accountHasBalance };
    if (isBlocked(blockers)) return { error: t.domain.accountBusy };

    const confirmEmail = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
    if (confirmEmail !== user.email.toLowerCase()) return { fieldErrors: { confirmEmail: t.actions.deleteEmailMismatch } };
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (row.passwordHash) {
      const { ok } = await verifyPassword(String(formData.get("password") ?? ""), row.passwordHash);
      if (!ok) return { fieldErrors: { password: t.actions.passwordWrong } };
    }

    const { sellerId, listingIds, reviewedSellerIds } = await deleteAccount(user.id);
    invalidate([
      TAGS.listings,
      TAGS.stats,
      `favorites-${user.id}`,
      ...(sellerId ? [TAGS.seller(sellerId)] : []),
      ...listingIds.map((id) => TAGS.listing(id)),
      // Their name is cached on the review lists of every seller they reviewed.
      ...reviewedSellerIds.map((id) => TAGS.seller(id)),
    ]);
    await audit(user.id, "user.delete", "User", user.id);
    await destroyCurrentSession();
  });
  if (result.ok) redirect(localePath("/goodbye", (await actionI18n()).locale));
  return result;
}

/**
 * Emails a password reset link. The answer is the same whether or not the
 * email has an account, so this can't be used to find out who is registered.
 */
export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, t } = await actionI18n();
  const parsed = forgotPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error, t, locale) };
  const { email } = parsed.data;
  const ip = await getClientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit(`reset-ip:${ip}`, 10, 900), rateLimit(`reset-email:${email}`, 3, 3600)]);
  if (!byIp.ok || !byEmail.ok) return { error: t.actions.resetLimit };

  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, deletedAt: true } });
  if (user && !user.deletedAt) {
    await sendResetLink(user, locale);
    await audit(user.id, "user.password_reset_requested", "User", user.id);
  }
  return { ok: true, message: t.actions.resetSent };
}

/** Sets a new password from the emailed link, signs out everywhere, then asks the user to sign in. */
export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, t } = await actionI18n();
  const parsed = resetPasswordSchema.safeParse(formToObject(formData));
  // A weak password is reported before the link is used up.
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error, t, locale) };
  const userId = await resetPasswordWithToken(parsed.data.token, parsed.data.newPassword);
  if (!userId) return { error: t.actions.resetInvalid };
  await audit(userId, "user.password_reset", "User", userId);
  await destroyCurrentSession();
  redirect(`${localePath("/login", locale)}?notice=password_reset`);
}
