import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { getDictionary } from "@/i18n/server";
import { ButtonLink } from "@/components/ui";

// Where a user lands after deleting their account.

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).goodbye.metaTitle, robots: { index: false } };
}

export default async function GoodbyePage() {
  const t = (await getDictionary()).goodbye;
  return (
    <div className="container-page flex max-w-xl flex-col items-center py-24 text-center">
      <CheckCircle2 className="size-10 text-pass" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">{t.heading}</h1>
      <p className="mt-3 text-slate-600">{t.body}</p>
      <p className="mt-3 text-sm text-slate-500">{t.again}</p>
      <ButtonLink href="/" className="mt-6">
        {t.home}
      </ButtonLink>
    </div>
  );
}
