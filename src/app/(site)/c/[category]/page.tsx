import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { CATEGORIES, getCategory } from "@/lib/catalog";
import { BrowseView } from "@/components/browse";
import { PageSkeleton } from "@/components/ui";

// Category landing pages are known at build time: prerender all of them.

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/c/[category]">): Promise<Metadata> {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) return {};
  return {
    title: `Used ${c.name} — condition-graded`,
    description: c.description,
    alternates: { canonical: `/c/${c.slug}` },
    openGraph: { title: `Used ${c.name} on ReGear`, description: c.description, url: `/c/${c.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[category]">) {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) notFound();

  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-brand-700">Home</Link> / <span className="text-slate-700">{c.name}</span>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Used {c.name}</h1>
      <p className="mt-2 mb-6 max-w-3xl text-slate-600">{c.description}</p>
      <Suspense fallback={<PageSkeleton />}>
        <BrowseView searchParams={searchParams} fixedCategory={c.slug} />
      </Suspense>
    </div>
  );
}
