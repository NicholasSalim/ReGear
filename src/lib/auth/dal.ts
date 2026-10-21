import "server-only";
import { cache } from "react";
import { forbidden, redirect, unauthorized } from "next/navigation";
import { db } from "@/lib/db";
import { readSessionToken, validateSessionToken } from "@/lib/auth/session";

// Data Access Layer for identity. Every authorization decision goes through
// these helpers; the proxy only performs optimistic redirects.

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  sessionExpiresAt: Date;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;
  const { id, email, name, role } = session.user;
  return { id, email, name, role, sessionExpiresAt: session.expiresAt };
});

/** For pages: redirect to login (preserving destination). */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
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
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") forbidden();
  return user;
}

export const getSellerProfile = cache(async (userId: string) =>
  db.sellerProfile.findUnique({ where: { userId } }),
);

/** Current user plus their seller profile; redirects to onboarding when missing. */
export async function requireSeller(next = "/sell") {
  const user = await requireUser(next);
  const seller = await getSellerProfile(user.id);
  if (!seller) redirect("/sell/onboarding");
  return { user, seller };
}
