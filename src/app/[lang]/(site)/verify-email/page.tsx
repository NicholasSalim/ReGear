import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { getDictionary } from "@/i18n/server";
import { ButtonLink, PageSkeleton } from "@/components/ui";

// Where the email confirmation link lands (see /api/auth/verify-email).

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.verifyMetaTitle, robots: { index: false } };
}

export default function VerifyEmailPage({ searchParams }: PageProps<"/[lang]/verify-email">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Result searchParams={searchParams} />
    </Suspense>
  );
}

async function Result({ searchParams }: { searchParams: PageProps<"/[lang]/verify-email">["searchParams"] }) {
  const [{ status }, dict] = await Promise.all([searchParams, getDictionary()]);
  const t = dict.auth;
  const ok = status === "ok";
  return (
    <div className="container-page flex max-w-xl flex-col items-center py-24 text-center">
      {ok ? <CheckCircle2 className="size-10 text-pass" aria-hidden /> : <XCircle className="size-10 text-fail" aria-hidden />}
      <h1 className="mt-4 text-2xl font-bold">{ok ? t.verifiedTitle : t.verifyInvalidTitle}</h1>
      <p className="mt-3 text-slate-600">{ok ? t.verifiedBody : t.verifyInvalidBody}</p>
      <ButtonLink href="/account" className="mt-6">
        {t.continueToAccount}
      </ButtonLink>
    </div>
  );
}
