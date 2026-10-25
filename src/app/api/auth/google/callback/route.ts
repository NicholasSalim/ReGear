import { timingSafeEqual } from "node:crypto";
import { ArcticFetchError, decodeIdToken, OAuth2RequestError } from "arctic";
import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { localePath } from "@/i18n/locales";
import { getRequestLocale } from "@/i18n/server";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  authReturnPage,
  findOrCreateGoogleUser,
  googleClient,
  GoogleSignInError,
  isGoogleConfigured,
  parseGoogleClaims,
} from "@/lib/auth/google";
import { getClientIp, getUserAgent, safeRedirectPath } from "@/lib/security/request";

// Step 2: Google redirects back here. Verify state, exchange the code (with
// the PKCE verifier) for tokens over TLS, read the ID token claims, then
// sign the user in with a regular ReGear session.
//
// Every failure sends the user back to the page they started on (sign in or
// sign up) with a specific message, and is recorded in the audit log with
// its reason (never tokens or codes) so problems can be diagnosed.
const FLOW_COOKIES = ["google_oauth_state", "google_code_verifier", "google_oauth_next", "google_oauth_from"];

function sameValue(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Map Google's `error` query parameter (RFC 6749 §4.1.2.1) to our message codes. */
function googleErrorCode(error: string) {
  if (error === "access_denied") return "google_denied";
  if (error === "invalid_client" || error === "unauthorized_client" || error === "invalid_scope") return "google_misconfigured";
  return "google_failed";
}

export async function GET(req: Request) {
  // Always run per request: never let the build prerender an OAuth response.
  await connection();
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const storedState = jar.get("google_oauth_state")?.value;
  const codeVerifier = jar.get("google_code_verifier")?.value;
  const next = safeRedirectPath(jar.get("google_oauth_next")?.value, "");
  const from = authReturnPage(jar.get("google_oauth_from")?.value);
  for (const name of FLOW_COOKIES) jar.delete(name);

  const fail = async (code: string, reason: string) => {
    console.warn(`[google] sign-in failed: ${code} (${reason})`);
    await audit(null, "auth.google_failed", "OAuth", "google", { stage: "callback", code, reason });
    const url = new URL(localePath(`/${from}`, await getRequestLocale()), env.NEXT_PUBLIC_SITE_URL);
    url.searchParams.set("error", code);
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };

  if (!isGoogleConfigured()) return fail("google_unavailable", "client id/secret not set");

  const googleError = params.get("error");
  if (googleError) return fail(googleErrorCode(googleError), `google returned error=${googleError.slice(0, 40)}`);

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("google_failed", "missing code or state");
  if (!storedState || !codeVerifier) return fail("google_state", "flow cookies missing (expired, blocked, or different browser/host)");
  if (!sameValue(state, storedState)) return fail("google_state", "state mismatch");

  let claims;
  try {
    const tokens = await googleClient().validateAuthorizationCode(code, codeVerifier);
    // The ID token came straight from Google's token endpoint over TLS, so per
    // OpenID Connect Core 3.1.3.7 its signature need not be re-verified; we
    // still check issuer, audience and expiry.
    claims = parseGoogleClaims(decodeIdToken(tokens.idToken()), env.GOOGLE_CLIENT_ID!);
  } catch (err) {
    if (err instanceof OAuth2RequestError) {
      // invalid_client = wrong secret; invalid_grant = code reused/expired or redirect URI mismatch.
      return fail(err.code === "invalid_client" ? "google_misconfigured" : "google_state", `token exchange: ${err.code}`);
    }
    if (err instanceof ArcticFetchError) return fail("google_failed", "could not reach Google");
    if (err instanceof GoogleSignInError) return fail("google_rejected", err.message);
    console.error("[google] token exchange failed", err);
    return fail("google_failed", "unexpected token error");
  }

  try {
    const { user, created, linked } = await findOrCreateGoogleUser(claims);
    if (user.lockedUntil && user.lockedUntil > new Date()) return fail("locked", "account locked");

    await createSession(user.id, { ip: await getClientIp(), userAgent: await getUserAgent() });
    await db.user.update({ where: { id: user.id }, data: { locale: await getRequestLocale() } });
    await audit(user.id, created ? "user.register_google" : linked ? "user.link_google" : "user.login_google", "User", user.id);

    return NextResponse.redirect(new URL(next || localePath(user.role === "ADMIN" ? "/admin" : "/account", await getRequestLocale()), env.NEXT_PUBLIC_SITE_URL));
  } catch (err) {
    if (err instanceof GoogleSignInError) return fail("google_rejected", err.message);
    console.error("[google] account setup failed", err);
    return fail("google_failed", "could not create or link the account");
  }
}
