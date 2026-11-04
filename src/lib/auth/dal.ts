import "server-only";
import { cache } from "react";
import { forbidden, redirect, unauthorized } from "next/navigation";
import { connection } from "next/server";
import { localePath } from "@/i18n/locales";
import { getRequestLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { readSessionToken, validateSessionToken } from "@/lib/auth/session";

// Data Access Layer for identity. Every authorization decision goes through
// these helpers; the proxy only performs optimistic redirects.

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Checkout and publishing need a confirmed address. */
  emailVerified: boolean;
  sessionExpiresAt: Date;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  // Checking expiry reads the clock, which may only happen at request time.
  await connection();
  const session = await validateSessionToken(token);
  if (!session) return null;
  const { id, email, name, role, emailVerifiedAt } = session.user;
  return { id, email, name, role, emailVerified: !!emailVerifiedAt, sessionExpiresAt: session.expiresAt };
});

/** For pages: redirect to login (preserving destination and language). */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getRequestLocale();
    const login = localePath("/login", locale);
    redirect(next ? `${login}?next=${encodeURIComponent(localePath(next, locale))}` : login);
  }
  return user;
}

/** For buyer and seller pages: admin accounts only do admin work, so they go to the admin console. */
export async function requireTrader(next?: string): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (user.role === "ADMIN") redirect(localePath("/admin", await getRequestLocale()));
  return user;
}

/** For actions / route handlers: throw a 401 instead of redirecting. */
export async function requireUserStrict(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) unauthorized();
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(localePath("/login", await getRequestLocale()));
  if (user.role !== "ADMIN") forbidden();
  return user;
}

export const getSellerProfile = cache(async (userId: string) =>
  db.sellerProfile.findUnique({ where: { userId } }),
);

/** Current user plus their seller profile; redirects to onboarding when missing. */
export async function requireSeller(next = "/sell") {
  const user = await requireTrader(next);
  const seller = await getSellerProfile(user.id);
  if (!seller) redirect(localePath("/sell/onboarding", await getRequestLocale()));
  return { user, seller };
}
