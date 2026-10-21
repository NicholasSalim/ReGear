import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { getPublicSeller } from "@/lib/data/catalog";
import { formatDate } from "@/lib/format";
import { Stars, VerifiedBadge } from "@/components/badges";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/sellers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicSeller(slug);
  if (!data) return { title: "Seller not found", robots: { index: false } };
  return {
    title: `${data.seller.displayName} — seller on ReGear`,
    description: data.seller.bio.slice(0, 160) || `Used electronics from ${data.seller.displayName}.`,
    alternates: { canonical: `/sellers/${data.seller.slug}` },
  };
}

export default async function SellerPage({ params }: PageProps<"/sellers/[slug]">) {
  const { slug } = await params;
  const data = await getPublicSeller(slug);
  if (!data) notFound();
  const { seller, listings, reviews } = data;

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
            <span>{seller.salesCount} sales</span>
            {seller.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {seller.location}
              </span>
            )}
            <span>Member since {formatDate(seller.createdAt)}</span>
          </div>
          {seller.bio && <p className="mt-3 max-w-3xl text-sm whitespace-pre-line text-slate-700">{seller.bio}</p>}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold">Listings ({listings.length})</h2>
        {listings.length ? <ListingGrid listings={listings} /> : <EmptyState title="No active listings right now" />}
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="mb-4 text-xl font-bold">Reviews</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-600">No reviews yet. Reviews can only be left by buyers after a completed order.</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <Stars rating={r.rating} />
                  <span className="text-xs text-slate-500">{formatDate(r.createdAt)}</span>
                </div>
                {r.comment && <p className="mt-2 text-sm text-slate-700">{r.comment}</p>}
                <p className="mt-2 text-xs text-slate-500">— {r.buyer.name}, verified purchase</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
