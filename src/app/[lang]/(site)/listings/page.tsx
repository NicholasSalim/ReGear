import type { Metadata } from "next";
import { Suspense } from "react";
import { alternatesFor } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";
import { BrowseView } from "@/components/browse";
import { PageSkeleton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return { title: t.browse.metaTitle, description: t.browse.metaDescription, alternates: alternatesFor("/listings", locale) };
}

export default async function ListingsPage({ searchParams }: PageProps<"/[lang]/listings">) {
  const t = await getDictionary();
  return (
    <div className="container-page py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">{t.browse.heading}</h1>
      <Suspense fallback={<PageSkeleton />}>
        <BrowseView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
