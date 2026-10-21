import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { alternatesFor } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";
import { CATEGORIES, getCategory } from "@/lib/catalog";
import { BrowseView } from "@/components/browse";
import { PageSkeleton } from "@/components/ui";

// Category landing pages are known at build time: prerender all of them.

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/c/[category]">): Promise<Metadata> {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) return {};
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  const name = pick(c.name, locale);
  const description = pick(c.description, locale);
  const alternates = alternatesFor(`/c/${c.slug}`, locale);
  return {
    title: t.category.metaTitle(name),
    description,
    alternates,
    openGraph: { title: t.category.ogTitle(name), description, url: alternates.canonical },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[lang]/c/[category]">) {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) notFound();
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  const name = pick(c.name, locale);

  return (
    <div className="container-page py-8">
      <nav aria-label={t.category.breadcrumb} className="mb-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-brand-700">{t.common.home}</Link> / <span className="text-slate-700">{name}</span>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.category.heading(name)}</h1>
      <p className="mt-2 mb-6 max-w-3xl text-slate-600">{pick(c.description, locale)}</p>
      <Suspense fallback={<PageSkeleton />}>
        <BrowseView searchParams={searchParams} fixedCategory={c.slug} />
      </Suspense>
    </div>
  );
}
