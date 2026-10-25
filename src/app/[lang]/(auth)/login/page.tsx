import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { localePath } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/security/request";
import { isGoogleConfigured } from "@/lib/auth/google";
import { AuthError, AuthNotice, GoogleButton } from "../google-button";
import { LoginForm } from "../auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.auth.loginMetaTitle, robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const [{ next, error, notice }, locale, t] = await Promise.all([searchParams, getLocale(), getDictionary()]);
  const target = safeRedirectPath(next, "");
  if (await getCurrentUser()) redirect(target || localePath("/account", locale));
  return (
    <>
      <h1 className="text-2xl font-bold">{t.auth.welcomeBack}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">{t.auth.loginIntro}</p>
      <AuthNotice code={typeof notice === "string" ? notice : undefined} />
      <AuthError code={typeof error === "string" ? error : undefined} />
      {isGoogleConfigured() && <GoogleButton next={target || undefined} from="login" />}
      <LoginForm next={target || undefined} googleEnabled={isGoogleConfigured()} />
    </>
  );
}
