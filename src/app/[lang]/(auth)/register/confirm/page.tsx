import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/client";
import { localePath } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { currentSignup } from "@/lib/auth/signup";
import { safeRedirectPath } from "@/lib/security/request";
import { ConfirmSignupForm } from "../../auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.auth.confirmMetaTitle, robots: { index: false } };
}

// Second step of sign-up: the code emailed to the address. Only the browser
// that started the sign-up gets here (it holds the sign-up cookie).
export default async function ConfirmSignupPage({ searchParams }: PageProps<"/[lang]/register/confirm">) {
  const [{ next }, locale, t] = await Promise.all([searchParams, getLocale(), getDictionary()]);
  const target = safeRedirectPath(next, "");
  if (await getCurrentUser()) redirect(target || localePath("/account", locale));
  const signup = await currentSignup();
  if (!signup) redirect(localePath("/register", locale));
  return (
    <>
      <h1 className="text-2xl font-bold">{t.auth.confirmHeading}</h1>
      <p className="mt-1 text-sm text-slate-600">{t.auth.confirmIntro(signup.email)}</p>
      <p className="mt-2 mb-6 text-xs text-slate-500">{t.auth.confirmHint}</p>
      <ConfirmSignupForm next={target || undefined} />
      <p className="mt-4 text-center text-sm">
        <Link href={target ? `/register?next=${encodeURIComponent(target)}` : "/register"} className="font-medium text-brand-700 hover:underline">
          {t.auth.useDifferentEmail}
        </Link>
      </p>
    </>
  );
}
