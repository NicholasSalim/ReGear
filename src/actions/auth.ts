"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { localePath } from "@/i18n/locales";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalidate, TAGS } from "@/lib/cache";
import { LEGAL_VERSION } from "@/lib/legal";
import { deleteAccount, getDeletionBlockers, isBlocked } from "@/lib/account/delete";
import { actionI18n, formToObject, runAction, type ActionState } from "@/lib/action";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyAllSessions, destroyCurrentSession, readSessionToken, renewSessionIfNeeded } from "@/lib/auth/session";
import { getCurrentUser, requireUserStrict } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp, getUserAgent, safeRedirectPath } from "@/lib/security/request";
import { changePasswordSchema, fieldErrors, loginSchema, profileSchema, registerSchema } from "@/lib/validation";

const LOCK_AFTER_FAILURES = 5;
const LOCK_MINUTES = 15;

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, t } = await actionI18n();
  const ip = await getClientIp();
  const limited = await rateLimit(`register:${ip}`, 10, 3600);
  if (!limited.ok) return { error: t.actions.signupLimit };

  const parsed = registerSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error, t, locale) };
  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { fieldErrors: { email: t.actions.emailTaken } };

  const user = await db.user.create({
    data: { name, email, passwordHash: await hashPassword(password), termsVersion: LEGAL_VERSION, termsAcceptedAt: new Date() },
  });
  await createSession(user.id, { ip, userAgent: await getUserAgent() });
  await audit(user.id, "user.register", "User", user.id);
  redirect(safeRedirectPath(formData.get("next"), localePath("/account", locale)));
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, t } = await actionI18n();
  const ip = await getClientIp();
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error, t, locale) };
  const { email, password } = parsed.data;

  const [byIp, byEmail] = await Promise.all([rateLimit(`login-ip:${ip}`, 30, 900), rateLimit(`login-email:${email}`, 10, 900)]);
  if (!byIp.ok || !byEmail.ok) return { error: t.actions.loginLimit };

  const generic = { error: t.actions.badCredentials };
  const user = await db.user.findUnique({ where: { email } });
  // Google-only accounts have no password; answer exactly like an unknown email.
  if (!user || !user.passwordHash) {
    // Equalise timing so attackers cannot enumerate registered emails.
    await verifyPassword(password, await getDummyHash());
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: t.actions.locked };
  }

  const { ok, needsRehash } = await verifyPassword(password, user.passwordHash);
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

  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
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
    const limited = await rateLimit(`pwchange:${user.id}`, 5, 900);
    if (!limited.ok) return { error: t.actions.passwordLimit };

    const data = changePasswordSchema.parse(formToObject(formData));
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
    if (isBlocked(blockers)) return { error: t.domain.accountBusy };

    const confirmEmail = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
    if (confirmEmail !== user.email.toLowerCase()) return { fieldErrors: { confirmEmail: t.actions.deleteEmailMismatch } };
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (row.passwordHash) {
      const { ok } = await verifyPassword(String(formData.get("password") ?? ""), row.passwordHash);
      if (!ok) return { fieldErrors: { password: t.actions.passwordWrong } };
    }

    const { sellerId, listingIds } = await deleteAccount(user.id);
    invalidate([
      TAGS.listings,
      TAGS.stats,
      `favorites-${user.id}`,
      ...(sellerId ? [TAGS.seller(sellerId)] : []),
      ...listingIds.map((id) => TAGS.listing(id)),
    ]);
    await audit(user.id, "user.delete", "User", user.id);
    await destroyCurrentSession();
  });
  if (result.ok) redirect(localePath("/goodbye", (await actionI18n()).locale));
  return result;
}
