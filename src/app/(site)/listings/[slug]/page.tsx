import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, MapPin, ShieldCheck, Truck, Undo2 } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { categoryName } from "@/lib/catalog";
import { GRADE_INFO, type ConditionGrade } from "@/lib/constants";
import { getPublicListing, getSimilarListings, type ListingDetail } from "@/lib/data/catalog";
import { currencyCode, formatDate, formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { GradeBadge, Stars, VerifiedBadge, warrantyLabel } from "@/components/badges";
import { ConditionReportView, SpecTable } from "@/components/condition-report";
import { CompareToggle } from "@/components/compare";
import { FavoriteButton } from "@/components/favorite-button";
import { Gallery } from "@/components/gallery";
import { JsonLd } from "@/components/json-ld";
import { ListingGrid } from "@/components/listing-card";
import { ButtonLink, Skeleton } from "@/components/ui";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata({ params }: PageProps<"/listings/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getPublicListing(slug);
  if (!listing) return { title: "Listing not found", robots: { index: false } };
  const grade = GRADE_INFO[listing.conditionGrade as ConditionGrade]?.label ?? "";
  const description = `${grade} condition ${listing.brand} ${listing.model} for ${formatMoney(listing.priceIdr)}. ${listing.description.slice(0, 120)}`;
  const image = listing.images[0];
  return {
    title: `${listing.title} — ${grade}`,
    description,
    alternates: { canonical: `/listings/${listing.slug}` },
    openGraph: {
      type: "website",
      title: listing.title,
      description,
      url: `/listings/${listing.slug}`,
      images: image ? [{ url: mediaUrl(image.key), width: image.width, height: image.height, alt: listing.title }] : undefined,
    },
    robots: listing.status === "SOLD" ? { index: false, follow: true } : undefined,
  };
}

export default async function ListingPage({ params }: PageProps<"/listings/[slug]">) {
  const { slug } = await params;
  const listing = await getPublicListing(slug);
  if (!listing) notFound();

  return (
    <div className="container-page py-6">
      <ProductJsonLd listing={listing} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
        <Link href="/" className="hover:text-brand-700">Home</Link> /{" "}
        <Link href={`/c/${listing.category}`} className="hover:text-brand-700">{categoryName(listing.category)}</Link> /{" "}
        <span className="text-slate-700">{listing.brand}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Gallery images={listing.images} title={listing.title} />
          <ConditionReportView listing={listing} />
          <SpecTable listing={listing} />
          <section aria-labelledby="desc-heading" className="card p-5 sm:p-6">
            <h2 id="desc-heading" className="text-lg font-bold">Seller&apos;s description</h2>
            <p className="mt-3 text-sm whitespace-pre-line text-slate-700">{listing.description}</p>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <GradeBadge grade={listing.conditionGrade} />
              <span className="text-xs text-slate-500">{categoryName(listing.category)}</span>
            </div>
            <h1 className="mt-2 text-xl font-bold leading-snug text-ink">{listing.title}</h1>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-ink">{formatMoney(listing.priceIdr)}</span>
              {listing.originalPriceIdr && (
                <span className="text-sm text-slate-400 line-through">{formatMoney(listing.originalPriceIdr)} new</span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {listing.shippingIdr === 0 ? "Free shipping" : `+ ${formatMoney(listing.shippingIdr)} shipping`}
            </p>

            <div className="mt-5 space-y-2">
              <Suspense fallback={<Skeleton className="h-24" />}>
                <BuyBox listing={listing} />
              </Suspense>
              <div className="pt-1">
                <CompareToggle id={listing.id} title={listing.title} category={listing.category} />
              </div>
            </div>

            <ul className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm text-slate-700">
              <li className="flex gap-2">
                <ShieldCheck className="size-4 shrink-0 text-brand-600" aria-hidden />
                <span>
                  <strong>{warrantyLabel(listing.warrantyType)}</strong>
                  {listing.warrantyType !== "NONE" && `, ${listing.warrantyMonths} months`}
                  {listing.warrantyTerms && <span className="block text-slate-500">{listing.warrantyTerms}</span>}
                </span>
              </li>
              <li className="flex gap-2">
                <Undo2 className="size-4 shrink-0 text-brand-600" aria-hidden />
                {listing.returnWindowDays > 0 ? `${listing.returnWindowDays}-day returns after delivery` : "No returns (buyer protection still applies)"}
              </li>
              <li className="flex gap-2">
                <Truck className="size-4 shrink-0 text-brand-600" aria-hidden /> Tracked shipping from {listing.location}
              </li>
              <li className="flex gap-2">
                <CalendarClock className="size-4 shrink-0 text-brand-600" aria-hidden /> Listed{" "}
                {listing.publishedAt ? formatDate(listing.publishedAt) : "recently"}
              </li>
            </ul>
          </div>

          <SellerCard seller={listing.seller} />
        </aside>
      </div>

      <Suspense>
        <Similar listingId={listing.id} category={listing.category} />
      </Suspense>
    </div>
  );
}

async function BuyBox({ listing }: { listing: ListingDetail }) {
  const user = await getCurrentUser();
  const isOwner = !!user && (await db.sellerProfile.findFirst({ where: { id: listing.sellerId, userId: user.id }, select: { id: true } }));
  const favorited = user
    ? !!(await db.favorite.findUnique({ where: { userId_listingId: { userId: user.id, listingId: listing.id } }, select: { userId: true } }))
    : false;

  if (isOwner) {
    return (
      <ButtonLink href={`/sell/listings/${listing.id}/edit`} variant="secondary" className="w-full">
        Edit your listing
      </ButtonLink>
    );
  }
  if (listing.status !== "ACTIVE") {
    return (
      <p className="rounded-lg bg-slate-100 px-3 py-3 text-center text-sm font-semibold text-slate-700">
        {listing.status === "SOLD" ? "This item has been sold" : "Reserved by another buyer"}
      </p>
    );
  }
  return (
    <>
      <ButtonLink href={user ? `/checkout/${listing.id}` : `/login?next=/checkout/${listing.id}`} className="w-full py-3 text-base">
        Buy now
      </ButtonLink>
      {user ? (
        <FavoriteButton listingId={listing.id} initial={favorited} />
      ) : (
        <ButtonLink href={`/login?next=/listings/${listing.slug}`} variant="secondary" className="w-full">
          Sign in to save
        </ButtonLink>
      )}
      <p className="text-center text-xs text-slate-500">Payment held in escrow until you accept the item.</p>
    </>
  );
}

function SellerCard({ seller }: { seller: ListingDetail["seller"] }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">Seller</p>
      <Link href={`/sellers/${seller.slug}`} className="mt-1 block text-base font-semibold text-ink hover:text-brand-700">
        {seller.displayName}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <VerifiedBadge status={seller.verificationStatus} />
        {seller.ratingCount > 0 ? <Stars rating={seller.ratingAvg} count={seller.ratingCount} /> : <span className="text-xs text-slate-500">No reviews yet</span>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div>
          <dt className="text-slate-400">Sales</dt>
          <dd className="font-semibold text-ink">{seller.salesCount}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Member since</dt>
          <dd className="font-semibold text-ink">{formatDate(seller.createdAt)}</dd>
        </div>
      </dl>
      {seller.location && (
        <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="size-3.5" aria-hidden /> {seller.location}
        </p>
      )}
    </div>
  );
}

async function Similar({ listingId, category }: { listingId: string; category: string }) {
  const items = await getSimilarListings(listingId, category);
  if (!items.length) return null;
  return (
    <section className="mt-12" aria-labelledby="similar-heading">
      <h2 id="similar-heading" className="mb-4 text-xl font-bold">Similar listings</h2>
      <ListingGrid listings={items} />
    </section>
  );
}

function ProductJsonLd({ listing }: { listing: ListingDetail }) {
  const url = `${siteUrl}/listings/${listing.slug}`;
  const availability =
    listing.status === "ACTIVE" ? "https://schema.org/InStock" : listing.status === "SOLD" ? "https://schema.org/SoldOut" : "https://schema.org/LimitedAvailability";
  return (
    <JsonLd
      data={[
        {
          "@context": "https://schema.org",
          "@type": "Product",
          name: listing.title,
          description: listing.description.slice(0, 500),
          brand: { "@type": "Brand", name: listing.brand },
          model: listing.model,
          sku: listing.id,
          category: categoryName(listing.category),
          image: listing.images.map((i) => `${siteUrl}${mediaUrl(i.key)}`),
          offers: {
            "@type": "Offer",
            url,
            price: String(listing.priceIdr),
            priceCurrency: currencyCode,
            availability,
            itemCondition: "https://schema.org/UsedCondition",
            seller: { "@type": "Organization", name: listing.seller.displayName },
            ...(listing.returnWindowDays > 0
              ? {
                  hasMerchantReturnPolicy: {
                    "@type": "MerchantReturnPolicy",
                    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
                    merchantReturnDays: listing.returnWindowDays,
                  },
                }
              : {}),
          },
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
            { "@type": "ListItem", position: 2, name: categoryName(listing.category), item: `${siteUrl}/c/${listing.category}` },
            { "@type": "ListItem", position: 3, name: listing.title, item: url },
          ],
        },
      ]}
    />
  );
}
