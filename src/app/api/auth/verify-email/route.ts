import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, isLocale, localePath } from "@/i18n/locales";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { verifyEmailWithToken } from "@/lib/auth/email-tokens";

// The link in the "confirm your email" message. It works without being signed
// in (the token proves the address), then shows the result in the language
// the email was written in.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const lang = params.get("lang");
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const userId = await verifyEmailWithToken(params.get("token"));
  if (userId) await audit(userId, "user.email_verified", "User", userId);
  const target = `${localePath("/verify-email", locale)}?status=${userId ? "ok" : "invalid"}`;
  return NextResponse.redirect(new URL(target, env.NEXT_PUBLIC_SITE_URL), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
