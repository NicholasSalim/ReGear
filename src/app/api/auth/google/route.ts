import { generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { localePath } from "@/i18n/locales";
import { getRequestLocale } from "@/i18n/server";
import { env, isHttps } from "@/lib/env";
import { audit } from "@/lib/audit";
import { authReturnPage, GOOGLE_SCOPES, googleClient, isGoogleConfigured } from "@/lib/auth/google";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp, safeRedirectPath } from "@/lib/security/request";

// Step 1: send the user to Google with a fresh state (CSRF) and PKCE verifier,
// both kept in short-lived HttpOnly cookies for the callback to check.
const TEN_MINUTES = 60 * 10;

export async function GET(req: Request) {
  // Always run per request: never let the build prerender an OAuth response.
  await connection();
  const params = new URL(req.url).searchParams;
  const from = authReturnPage(params.get("from"));
  const next = safeRedirectPath(params.get("next"), "");

  const fail = async (code: string) => {
    await audit(null, "auth.google_failed", "OAuth", "google", { stage: "start", code });
    const url = new URL(localePath(`/${from}`, await getRequestLocale()), env.NEXT_PUBLIC_SITE_URL);
    url.searchParams.set("error", code);
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };

  if (!isGoogleConfigured()) return fail("google_unavailable");
  const limited = await rateLimit(`oauth-start:${await getClientIp()}`, 30, 900);
  if (!limited.ok) return fail("rate_limited");

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = googleClient().createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);
  url.searchParams.set("prompt", "select_account");

  const jar = await cookies();
  const opts = { httpOnly: true, secure: isHttps, sameSite: "lax" as const, path: "/", maxAge: TEN_MINUTES };
  jar.set("google_oauth_state", state, opts);
  jar.set("google_code_verifier", codeVerifier, opts);
  jar.set("google_oauth_from", from, opts);
  if (next) jar.set("google_oauth_next", next, opts);
  else jar.delete("google_oauth_next");

  return NextResponse.redirect(url);
}
