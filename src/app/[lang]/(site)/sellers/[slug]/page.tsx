import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { alternatesFor } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";
import { getPublicSeller } from "@/lib/data/catalog";
import { formatDate } from "@/lib/format";
import { Stars, VerifiedBadge } from "@/components/badges";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/[lang]/sellers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [data, locale, t] = await Promise.all([getPublicSeller(slug), getLocale(), getDictionary()]);
  if (!data) return { title: t.seller.notFoundTitle, robots: { index: false } };
  return {
    title: t.seller.metaTitle(data.seller.displayName),
    description: data.seller.bio.slice(0, 160) || t.seller.metaDescription(data.seller.displayName),
    alternates: alternatesFor(`/sellers/${data.seller.slug}`, locale),
  };
}

export default async function SellerPage({ params }: PageProps<"/[lang]/sellers/[slug]">) {
  const { slug } = await params;
  const data = await getPublicSeller(slug);
  if (!data) notFound();
  const { seller, listings, reviews } = data;
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);

  return (
    <div className="container-page py-8">
      <header className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand-100 text-2xl font-bold text-brand-800" aria-hidden>
          {seller.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{seller.displayName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <VerifiedBadge status={seller.verificationStatus} />
            {seller.ratingCount > 0 && <Stars rating={seller.ratingAvg} count={seller.ratingCount} />}
            <span>{t.seller.salesCount(seller.salesCount)}</span>
            {seller.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {seller.location}
              </span>
            )}
            <span>{t.seller.memberSince(formatDate(seller.createdAt, locale))}</span>
          </div>
          {seller.bio && <p className="mt-3 max-w-3xl text-sm whitespace-pre-line text-slate-700">{seller.bio}</p>}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold">{t.seller.listings(listings.length)}</h2>
        {listings.length ? <ListingGrid listings={listings} /> : <EmptyState title={t.seller.noListings} />}
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="mb-4 text-xl font-bold">{t.seller.reviews}</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-600">{t.seller.noReviews}</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <Stars rating={r.rating} />
                  <span className="text-xs text-slate-500">{formatDate(r.createdAt, locale)}</span>
                </div>
                {r.comment && <p className="mt-2 text-sm text-slate-700">{r.comment}</p>}
                <p className="mt-2 text-xs text-slate-500">{t.seller.verifiedPurchase(r.buyer.name)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
