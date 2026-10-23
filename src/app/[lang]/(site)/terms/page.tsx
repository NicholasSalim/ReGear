import type { Metadata } from "next";
import { alternatesFor } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { LegalPage } from "@/components/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return { title: LEGAL_DOCUMENTS.terms[locale].title, description: t.legal.termsDescription, alternates: alternatesFor("/terms", locale) };
}

export default function TermsPage() {
  return <LegalPage document="terms" />;
}
