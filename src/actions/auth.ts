"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { formToObject, runAction, type ActionState } from "@/lib/action";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyAllSessions, destroyCurrentSession, readSessionToken, renewSessionIfNeeded } from "@/lib/auth/session";
import { getCurrentUser, requireUserStrict } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp, getUserAgent, safeRedirectPath } from "@/lib/security/request";
import { changePasswordSchema, fieldErrors, loginSchema, profileSchema, registerSchema } from "@/lib/validation";

const LOCK_AFTER_FAILURES = 5;
const LOCK_MINUTES = 15;

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ip = await getClientIp();
  const limited = await rateLimit(`register:${ip}`, 10, 3600);
  if (!limited.ok) return { error: "Too many sign-up attempts. Please try again later." };

  const parsed = registerSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { fieldErrors: { email: "An account with this email already exists. Try signing in." } };

  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  await createSession(user.id, { ip, userAgent: await getUserAgent() });
  await audit(user.id, "user.register", "User", user.id);
  redirect(safeRedirectPath(formData.get("next"), "/account"));
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ip = await getClientIp();
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { email, password } = parsed.data;

  const [byIp, byEmail] = await Promise.all([rateLimit(`login-ip:${ip}`, 30, 900), rateLimit(`login-email:${email}`, 10, 900)]);
  if (!byIp.ok || !byEmail.ok) return { error: "Too many sign-in attempts. Please wait a few minutes and try again." };

  const generic = { error: "Incorrect email or password." };
  const user = await db.user.findUnique({ where: { email } });
  // Google-only accounts have no password; answer exactly like an unknown email.
  if (!user || !user.passwordHash) {
    // Equalise timing so attackers cannot enumerate registered emails.
    await verifyPassword(password, await getDummyHash());
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "This account is temporarily locked after repeated failed sign-ins. Try again in a few minutes." };
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
  redirect(safeRedirectPath(formData.get("next"), user.role === "ADMIN" ? "/admin" : "/account"));
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) await audit(user.id, "user.logout", "User", user.id);
  redirect("/");
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { name } = profileSchema.parse(formToObject(formData));
    await db.user.update({ where: { id: user.id }, data: { name } });
    const token = await readSessionToken();
    if (token) await renewSessionIfNeeded(token, user.sessionExpiresAt);
    return { ok: true, message: "Profile updated." };
  });
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const limited = await rateLimit(`pwchange:${user.id}`, 5, 900);
    if (!limited.ok) return { error: "Too many attempts. Try again later." };

    const data = changePasswordSchema.parse(formToObject(formData));
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    // Accounts created with Google can add a first password without one.
    if (row.passwordHash) {
      const { ok } = await verifyPassword(data.currentPassword, row.passwordHash);
      if (!ok) return { fieldErrors: { currentPassword: "Current password is incorrect." } };
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
    return { ok: true, message: row.passwordHash ? "Password changed. Other devices have been signed out." : "Password set. You can now also sign in with your email." };
  });
}
