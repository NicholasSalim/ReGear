import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { isEmailTokenValid } from "@/lib/auth/email-tokens";
import { ButtonLink } from "@/components/ui";
import { ResetPasswordForm } from "../password-forms";

// The link in the password reset email. The token is checked here only to
// decide what to show; it's used up when the new password is saved.

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.resetMetaTitle, robots: { index: false }, referrer: "no-referrer" };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/[lang]/reset-password">) {
  const [{ token }, dict] = await Promise.all([searchParams, getDictionary()]);
  const t = dict.auth;
  if (typeof token !== "string" || !(await isEmailTokenValid(token, "RESET_PASSWORD"))) {
    return (
      <>
        <h1 className="text-2xl font-bold">{t.resetInvalidTitle}</h1>
        <p className="mt-2 mb-6 text-sm text-slate-600">{t.resetInvalidBody}</p>
        <ButtonLink href="/forgot-password" className="w-full">
          {t.requestNewLink}
        </ButtonLink>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-bold">{t.resetHeading}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">{t.resetIntro}</p>
      <ResetPasswordForm token={token} />
    </>
  );
}
