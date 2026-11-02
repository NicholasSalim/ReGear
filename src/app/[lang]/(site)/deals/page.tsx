import type { Metadata } from "next";
import { alternatesFor } from "@/i18n/metadata";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { getDeals } from "@/lib/data/catalog";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return { title: t.deals.metaTitle, description: t.deals.intro, alternates: alternatesFor("/deals", locale) };
}

/** Everything priced well below new, biggest saving first. */
export default async function DealsPage() {
  const [t, deals] = await Promise.all([getDictionary(), getDeals(48)]);
  return (
    <div className="container-page py-8">
      <nav className="mb-3 text-sm text-slate-500" aria-label={t.common.breadcrumb}>
        <Link href="/" className="hover:text-brand-700">{t.common.home}</Link> / <span className="text-slate-700">{t.deals.heading}</span>
      </nav>
      <h1 className="text-2xl font-extrabold sm:text-3xl">{t.deals.heading}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">{t.deals.intro}</p>
      {deals.length ? (
        <ListingGrid listings={deals} priorityCount={4} />
      ) : (
        <EmptyState
          title={t.deals.none}
          action={
            <Link href="/listings" className="text-sm font-semibold text-brand-700 hover:underline">
              {t.home.browseAll}
            </Link>
          }
        />
      )}
    </div>
  );
}
