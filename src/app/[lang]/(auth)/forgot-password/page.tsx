import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { ForgotPasswordForm } from "../password-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.forgotMetaTitle, robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const t = (await getDictionary()).auth;
  return (
    <>
      <h1 className="text-2xl font-bold">{t.forgotHeading}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">{t.forgotIntro}</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          {t.backToSignIn}
        </Link>
      </p>
    </>
  );
}
