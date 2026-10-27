import "server-only";
import { Google } from "arctic";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { LEGAL_VERSION } from "@/lib/legal";

// Google sign-in via OAuth 2.0 Authorization Code flow with PKCE + state,
// using OpenID Connect to identify the user. After the callback succeeds we
// issue a normal ReGear session, so authorization works exactly as for
// password users.

export const GOOGLE_REDIRECT_PATH = "/api/auth/google/callback";
export const GOOGLE_SCOPES = ["openid", "email", "profile"];

export function isGoogleConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function googleClient() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google sign-in is not configured");
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, new URL(GOOGLE_REDIRECT_PATH, env.NEXT_PUBLIC_SITE_URL).toString());
}

export type GoogleClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
};

export class GoogleSignInError extends Error {}

/** Validate the ID token claims we rely on. */
export function parseGoogleClaims(raw: unknown, clientId: string): GoogleClaims {
  const c = raw as Record<string, unknown>;
  const iss = c.iss;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") throw new GoogleSignInError("Unexpected token issuer");
  const aud = c.aud;
  if (aud !== clientId && !(Array.isArray(aud) && aud.includes(clientId))) throw new GoogleSignInError("Token was issued for another app");
  if (typeof c.exp !== "number" || c.exp * 1000 < Date.now()) throw new GoogleSignInError("Token expired");
  if (typeof c.sub !== "string" || typeof c.email !== "string") throw new GoogleSignInError("Token is missing the account id or email");
  return {
    sub: c.sub,
    email: c.email.trim().toLowerCase(),
    email_verified: c.email_verified === true || c.email_verified === "true",
    name: typeof c.name === "string" ? c.name.slice(0, 60) : undefined,
  };
}

/**
 * Resolve the ReGear user for a Google identity:
 * 1. an already-linked Google account wins;
 * 2. otherwise an existing user with the same email is linked, but only
 *    because Google has verified ownership of that email. If that account
 *    never confirmed its email, whoever registered it may not own the
 *    address: their password is dropped and their sessions ended, so the
 *    real owner doesn't inherit an account someone else can still open;
 * 3. otherwise a new password-less account is created.
 */
export async function findOrCreateGoogleUser(claims: GoogleClaims) {
  if (!claims.email_verified) throw new GoogleSignInError("Your Google email address is not verified");

  const linked = await db.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: claims.sub } },
    include: { user: true },
  });
  if (linked) return { user: linked.user, created: false, linked: false };

  const existing = await db.user.findUnique({ where: { email: claims.email } });
  if (existing) {
    const user = await db.$transaction(async (tx) => {
      await tx.oAuthAccount.create({
        data: { provider: "google", providerAccountId: claims.sub, userId: existing.id, email: claims.email },
      });
      if (existing.emailVerifiedAt) return existing;
      // Linking requires Google to have verified this same address.
      await tx.session.deleteMany({ where: { userId: existing.id } });
      return tx.user.update({
        where: { id: existing.id },
        data: { emailVerifiedAt: new Date(), passwordHash: null, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
      });
    });
    return { user, created: false, linked: true, passwordCleared: !existing.emailVerifiedAt };
  }

  const name = claims.name?.trim() || claims.email.split("@")[0];
  const user = await db.user.create({
    data: {
      email: claims.email,
      name: name.length >= 2 ? name : `${name} user`,
      passwordHash: null,
      // The Google button states that continuing accepts the Terms and Privacy Policy.
      termsVersion: LEGAL_VERSION,
      termsAcceptedAt: new Date(),
      emailVerifiedAt: new Date(),
      oauthAccounts: { create: { provider: "google", providerAccountId: claims.sub, email: claims.email } },
    },
  });
  return { user, created: true, linked: false };
}

/** Which auth page a Google flow started from, so failures return the user there. */
export function authReturnPage(value: string | null | undefined): "login" | "register" {
  return value === "register" ? "register" : "login";
}
