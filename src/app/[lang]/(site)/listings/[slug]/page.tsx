import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, MapPin, ShieldCheck, Truck, Undo2 } from "lucide-react";
import { Link } from "@/i18n/client";
import { localePath, pick, type Locale } from "@/i18n/locales";
import { alternatesFor } from "@/i18n/metadata";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
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

export async function generateMetadata({ params }: PageProps<"/[lang]/listings/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [listing, locale, t] = await Promise.all([getPublicListing(slug), getLocale(), getDictionary()]);
  if (!listing) return { title: t.listing.notFoundTitle, robots: { index: false } };
  const info = GRADE_INFO[listing.conditionGrade as ConditionGrade];
  const grade = info ? pick(info.label, locale) : "";
  const description = `${t.listing.metaDescription(grade, listing.brand, listing.model, formatMoney(listing.priceIdr))} ${listing.description.slice(0, 120)}`;
  const image = listing.images[0];
  const alternates = alternatesFor(`/listings/${listing.slug}`, locale);
  return {
    title: `${listing.title} — ${grade}`,
    description,
    alternates,
    openGraph: {
      type: "website",
      title: listing.title,
      description,
      url: alternates.canonical,
      images: image ? [{ url: mediaUrl(image.key), width: image.width, height: image.height, alt: listing.title }] : undefined,
    },
    robots: listing.status === "SOLD" ? { index: false, follow: true } : undefined,
  };
}

export default async function ListingPage({ params }: PageProps<"/[lang]/listings/[slug]">) {
  const { slug } = await params;
  const listing = await getPublicListing(slug);
  if (!listing) notFound();
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  const category = categoryName(listing.category, locale);

  return (
    <div className="container-page py-6">
      <ProductJsonLd listing={listing} locale={locale} t={t} />
      <nav aria-label={t.category.breadcrumb} className="mb-4 text-sm text-slate-500">
        <Link href="/" className="hover:text-brand-700">{t.common.home}</Link> /{" "}
        <Link href={`/c/${listing.category}`} className="hover:text-brand-700">{category}</Link> /{" "}
        <span className="text-slate-700">{listing.brand}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Gallery images={listing.images} title={listing.title} />
          <ConditionReportView listing={listing} />
          <SpecTable listing={listing} />
          <section aria-labelledby="desc-heading" className="card p-5 sm:p-6">
            <h2 id="desc-heading" className="text-lg font-bold">{t.listing.sellersDescription}</h2>
            <p className="mt-3 text-sm whitespace-pre-line text-slate-700">{listing.description}</p>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <GradeBadge grade={listing.conditionGrade} />
              <span className="text-xs text-slate-500">{category}</span>
            </div>
            <h1 className="mt-2 text-xl font-bold leading-snug text-ink">{listing.title}</h1>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-ink">{formatMoney(listing.priceIdr)}</span>
              {listing.originalPriceIdr && (
                <span className="text-sm text-slate-400 line-through">{t.common.priceNew(formatMoney(listing.originalPriceIdr))}</span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {listing.shippingIdr === 0 ? t.listing.freeShipping : t.listing.plusShipping(formatMoney(listing.shippingIdr))}
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
                  <strong>{warrantyLabel(listing.warrantyType, locale)}</strong>
                  {listing.warrantyType !== "NONE" && t.listing.warrantyMonths(listing.warrantyMonths)}
                  {listing.warrantyTerms && <span className="block text-slate-500">{listing.warrantyTerms}</span>}
                </span>
              </li>
              <li className="flex gap-2">
                <Undo2 className="size-4 shrink-0 text-brand-600" aria-hidden />
                {listing.returnWindowDays > 0 ? t.listing.returnsDays(listing.returnWindowDays) : t.listing.noReturns}
              </li>
              <li className="flex gap-2">
                <Truck className="size-4 shrink-0 text-brand-600" aria-hidden /> {t.listing.shipsFrom(listing.location)}
              </li>
              <li className="flex gap-2">
                <CalendarClock className="size-4 shrink-0 text-brand-600" aria-hidden />
                {listing.publishedAt ? t.listing.listed(formatDate(listing.publishedAt, locale)) : t.listing.listedRecently}
              </li>
            </ul>
          </div>

          <SellerCard seller={listing.seller} locale={locale} t={t} />
        </aside>
      </div>

      <Suspense>
        <Similar listingId={listing.id} category={listing.category} heading={t.listing.similar} />
      </Suspense>
    </div>
  );
}

async function BuyBox({ listing }: { listing: ListingDetail }) {
  const [user, locale, t] = await Promise.all([getCurrentUser(), getLocale(), getDictionary()]);
  const isOwner = !!user && (await db.sellerProfile.findFirst({ where: { id: listing.sellerId, userId: user.id }, select: { id: true } }));
  const favorited = user
    ? !!(await db.favorite.findUnique({ where: { userId_listingId: { userId: user.id, listingId: listing.id } }, select: { userId: true } }))
    : false;
  // After signing in, come back to the same page in the same language.
  const loginNext = (path: string) => `/login?next=${encodeURIComponent(localePath(path, locale))}`;

  if (isOwner) {
    return (
      <ButtonLink href={`/sell/listings/${listing.id}/edit`} variant="secondary" className="w-full">
        {t.listing.editYourListing}
      </ButtonLink>
    );
  }
  if (listing.status !== "ACTIVE") {
    return (
      <p className="rounded-lg bg-slate-100 px-3 py-3 text-center text-sm font-semibold text-slate-700">
        {listing.status === "SOLD" ? t.listing.sold : t.listing.reserved}
      </p>
    );
  }
  return (
    <>
      <ButtonLink href={user ? `/checkout/${listing.id}` : loginNext(`/checkout/${listing.id}`)} className="w-full py-3 text-base">
        {t.listing.buyNow}
      </ButtonLink>
      {user ? (
        <FavoriteButton listingId={listing.id} initial={favorited} />
      ) : (
        <ButtonLink href={loginNext(`/listings/${listing.slug}`)} variant="secondary" className="w-full">
          {t.listing.signInToSave}
        </ButtonLink>
      )}
      <p className="text-center text-xs text-slate-500">{t.listing.escrowNote}</p>
    </>
  );
}

function SellerCard({ seller, locale, t }: { seller: ListingDetail["seller"]; locale: Locale; t: Dictionary }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{t.listing.seller}</p>
      <Link href={`/sellers/${seller.slug}`} className="mt-1 block text-base font-semibold text-ink hover:text-brand-700">
        {seller.displayName}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <VerifiedBadge status={seller.verificationStatus} />
        {seller.ratingCount > 0 ? <Stars rating={seller.ratingAvg} count={seller.ratingCount} /> : <span className="text-xs text-slate-500">{t.listing.noReviewsYet}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div>
          <dt className="text-slate-400">{t.listing.sales}</dt>
          <dd className="font-semibold text-ink">{seller.salesCount}</dd>
        </div>
        <div>
          <dt className="text-slate-400">{t.listing.memberSince}</dt>
          <dd className="font-semibold text-ink">{formatDate(seller.createdAt, locale)}</dd>
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

async function Similar({ listingId, category, heading }: { listingId: string; category: string; heading: string }) {
  const items = await getSimilarListings(listingId, category);
  if (!items.length) return null;
  return (
    <section className="mt-12" aria-labelledby="similar-heading">
      <h2 id="similar-heading" className="mb-4 text-xl font-bold">{heading}</h2>
      <ListingGrid listings={items} />
    </section>
  );
}

function ProductJsonLd({ listing, locale, t }: { listing: ListingDetail; locale: Locale; t: Dictionary }) {
  const url = `${siteUrl}${localePath(`/listings/${listing.slug}`, locale)}`;
  const category = categoryName(listing.category, locale);
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
          category,
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
            { "@type": "ListItem", position: 1, name: t.common.home, item: `${siteUrl}${localePath("/", locale)}` },
            { "@type": "ListItem", position: 2, name: category, item: `${siteUrl}${localePath(`/c/${listing.category}`, locale)}` },
            { "@type": "ListItem", position: 3, name: listing.title, item: url },
          ],
        },
      ]}
    />
  );
}
