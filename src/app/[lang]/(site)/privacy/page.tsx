import type { Metadata } from "next";
import { alternatesFor } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { LegalPage } from "@/components/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return { title: LEGAL_DOCUMENTS.privacy[locale].title, description: t.legal.privacyDescription, alternates: alternatesFor("/privacy", locale) };
}

export default function PrivacyPage() {
  return <LegalPage document="privacy" />;
}
