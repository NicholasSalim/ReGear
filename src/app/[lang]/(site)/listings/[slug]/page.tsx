import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClipboardCheck, Eye, MessageCircle, ShieldCheck, ShoppingCart } from "lucide-react";
import { Link } from "@/i18n/client";
import { localePath, pick, type Locale } from "@/i18n/locales";
import { alternatesFor } from "@/i18n/metadata";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { categoryName } from "@/lib/catalog";
import { GRADE_INFO, type ConditionGrade } from "@/lib/constants";
import { getPublicListing, getRecentReviews, getSimilarListings, type ListingDetail } from "@/lib/data/catalog";
import { currencyCode, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { GradeBadge, Stars, VerifiedBadge, warrantyLabel } from "@/components/badges";
import { ConditionReportView, SpecTable } from "@/components/condition-report";
import { ConditionStrip, stripLabel } from "@/components/condition-strip";
import { CompareToggle } from "@/components/compare";
import { FavoriteButton } from "@/components/favorite-button";
import { Gallery } from "@/components/gallery";
import { JsonLd } from "@/components/json-ld";
import { TileRow } from "@/components/listing-card";
import { RecordView } from "@/components/recently-viewed";
import { MakeOfferForm } from "@/components/offer-form";
import { ActionButton } from "@/components/forms";
import { getMyOffersForListing, MAX_OFFERS_PER_LISTING, minimumOffer, offerStatus } from "@/lib/offers";
import { makeOfferAction, withdrawOfferAction } from "@/actions/offers";
import { addToCartAction } from "@/actions/buying";
import { isInCart } from "@/lib/cart";
import { Skeleton } from "@/components/ui";

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


// Laid out like a department store's item page: photos beside the buy box,
// then everything about the item, then everything about the seller.
export default async function ListingPage({ params }: PageProps<"/[lang]/listings/[slug]">) {
  const { slug } = await params;
  const listing = await getPublicListing(slug);
  if (!listing) notFound();
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  const category = categoryName(listing.category, locale);
  const grade = GRADE_INFO[listing.conditionGrade as ConditionGrade];
  const checks = listing.conditionReport?.checks ?? [];
  const discount =
    listing.originalPriceIdr && listing.originalPriceIdr > listing.priceIdr ? Math.round((1 - listing.priceIdr / listing.originalPriceIdr) * 100) : 0;

  return (
    <div className="container-page py-6">
      <ProductJsonLd listing={listing} locale={locale} t={t} />
      <RecordView slug={listing.slug} title={listing.title} image={listing.images[0]?.key ?? null} price={listing.priceIdr} />
      <nav aria-label={t.category.breadcrumb} className="mb-4 text-sm text-slate-500">
        <Link href="/" className="hover:text-brand-700 hover:underline">{t.common.home}</Link> ›{" "}
        <Link href={`/c/${listing.category}`} className="hover:text-brand-700 hover:underline">{category}</Link> ›{" "}
        <Link href={`/c/${listing.category}?brand=${encodeURIComponent(listing.brand)}`} className="hover:text-brand-700 hover:underline">
          {listing.brand}
        </Link>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
        <Gallery images={listing.images} title={listing.title} />

        <div>
          <h1 className="text-2xl leading-tight font-bold text-ink" style={{ fontStretch: "100%" }}>{listing.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{[listing.brand, listing.model, category].filter(Boolean).join(" · ")}</p>

          <SellerLine seller={listing.seller} listingId={listing.id} t={t} />

          <div className="mt-4">
            <p className="num wide text-3xl font-extrabold text-ink">{formatMoney(listing.priceIdr)}</p>
            {listing.acceptsOffers && listing.status === "ACTIVE" && <p className="text-sm font-medium text-slate-600">{t.listing.orBestOffer}</p>}
            {discount >= 5 && listing.originalPriceIdr && (
              <p className="mt-0.5 text-sm text-slate-600">
                <span className="line-through">{t.common.priceNew(formatMoney(listing.originalPriceIdr))}</span>{" "}
                <span className="font-semibold text-pass">({t.home.percentOff(discount)})</span>
              </p>
            )}
          </div>

          <dl className="mt-5 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-rule pt-4 text-sm">
            <dt className="pt-0.5 text-slate-500">{t.listing.condition}:</dt>
            <dd>
              <GradeBadge grade={listing.conditionGrade} />
              {grade && <p className="mt-1 text-slate-600">{pick(grade.summary, locale)}</p>}
              {checks.length > 0 && (
                <div className="mt-2 max-w-64">
                  <ConditionStrip checks={checks} label={stripLabel(checks, t.condition)} />
                  <a href="#condition-heading" className="mt-1.5 inline-block font-medium text-brand-700 underline hover:text-brand-800">
                    {t.listing.readReport}
                  </a>
                </div>
              )}
            </dd>
          </dl>

          <div className="mt-5 space-y-2.5">
            <Suspense fallback={<Skeleton className="h-28 rounded-3xl" />}>
              <BuyBox listing={listing} />
            </Suspense>
            <div className="flex justify-center pt-1">
              <CompareToggle id={listing.id} title={listing.title} category={listing.category} />
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-rule pt-5 text-sm">
            <dt className="text-slate-500">{t.listing.shipping}:</dt>
            <dd>
              <span className={listing.shippingIdr === 0 ? "font-semibold text-ink" : "text-ink"}>
                {listing.shippingIdr === 0 ? t.listing.freeShipping : t.listing.plusShipping(formatMoney(listing.shippingIdr))}
              </span>
              {listing.location && <span className="block text-slate-500">{t.listing.locatedIn(listing.location)}</span>}
            </dd>
            <dt className="text-slate-500">{t.listing.returns}:</dt>
            <dd className="text-ink">{listing.returnWindowDays > 0 ? t.listing.returnsDays(listing.returnWindowDays) : t.listing.noReturns}</dd>
            <dt className="text-slate-500">{t.listing.warranty}:</dt>
            <dd className="text-ink">
              {warrantyLabel(listing.warrantyType, locale)}
              {listing.warrantyType !== "NONE" && t.listing.warrantyMonths(listing.warrantyMonths)}
              {listing.warrantyTerms && <span className="block text-slate-500">{listing.warrantyTerms}</span>}
            </dd>
            <dt className="text-slate-500">{t.listing.payments}:</dt>
            <dd className="text-ink">{t.listing.paymentsValue}</dd>
          </dl>

          <section className="mt-6 rounded-2xl border border-rule p-4" aria-labelledby="confidence-heading">
            <h2 id="confidence-heading" className="font-bold">{t.listing.confidenceTitle}</h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex gap-3">
                <ShieldCheck className="size-5 shrink-0 text-pass" aria-hidden />
                <span>
                  <strong className="block font-semibold">{t.listing.protectionTitle}</strong>
                  <span className="text-slate-600">{t.listing.protectionBody}</span>{" "}
                  <Link href="/how-it-works#protection" className="text-brand-700 underline">{t.listing.learnMore}</Link>
                </span>
              </li>
              <li className="flex gap-3">
                <ClipboardCheck className="size-5 shrink-0 text-pass" aria-hidden />
                <span>
                  <strong className="block font-semibold">{t.listing.reportTitle}</strong>
                  <span className="text-slate-600">{t.listing.reportBody}</span>
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <section className="mt-14" aria-labelledby="about-item">
        <h2 id="about-item" className="mb-5 text-2xl font-extrabold">{t.listing.aboutItem}</h2>
        <div className="space-y-6">
          <SpecTable listing={listing} />
          <ConditionReportView listing={listing} />
          <section aria-labelledby="desc-heading" className="card p-5 sm:p-6">
            <h2 id="desc-heading" className="text-xl font-extrabold">{t.listing.sellersDescription}</h2>
            <p className="mt-3 text-sm whitespace-pre-line text-slate-700">{listing.description}</p>
            <p className="mt-4 text-xs text-slate-500">
              {listing.publishedAt ? t.listing.listed(formatDate(listing.publishedAt, locale)) : t.listing.listedRecently}
            </p>
          </section>
        </div>
      </section>

      <AboutSeller seller={listing.seller} listingId={listing.id} locale={locale} t={t} />

      <Suspense>
        <Similar listingId={listing.id} category={listing.category} heading={t.listing.similar} />
      </Suspense>
    </div>
  );
}

/** The seller's name and standing, right under the title, as the first thing to trust. */
function SellerLine({ seller, listingId, t }: { seller: ListingDetail["seller"]; listingId: string; t: Dictionary }) {
  return (
    <div className="mt-4 flex items-center gap-3 border-y border-rule py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-plate text-sm font-bold text-ink" aria-hidden>
        {seller.displayName.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-x-2">
          <Link href={`/sellers/${seller.slug}`} className="font-semibold text-ink hover:underline">
            {seller.displayName}
          </Link>
          <span className="text-slate-500">({t.listing.salesCount(seller.salesCount)})</span>
          <VerifiedBadge status={seller.verificationStatus} />
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-slate-600">
          {seller.ratingCount > 0 ? <Stars rating={seller.ratingAvg} count={seller.ratingCount} /> : <span>{t.listing.noReviewsYet}</span>}
          <span aria-hidden>·</span>
          <Link href={`/sellers/${seller.slug}`} className="text-brand-700 underline hover:text-brand-800">
            {t.listing.otherItems}
          </Link>
          <span aria-hidden>·</span>
          <Link href={`/account/messages/new?listing=${listingId}`} className="text-brand-700 underline hover:text-brand-800">
            {t.messages.contactSeller}
          </Link>
        </p>
      </div>
    </div>
  );
}

async function BuyBox({ listing }: { listing: ListingDetail }) {
  const [user, locale, t, watchers] = await Promise.all([
    getCurrentUser(),
    getLocale(),
    getDictionary(),
    db.favorite.count({ where: { listingId: listing.id } }),
  ]);
  const isOwner = !!user && (await db.sellerProfile.findFirst({ where: { id: listing.sellerId, userId: user.id }, select: { id: true } }));
  const favorited = user
    ? !!(await db.favorite.findUnique({ where: { userId_listingId: { userId: user.id, listingId: listing.id } }, select: { userId: true } }))
    : false;
  // After signing in, come back to the same page in the same language.
  const loginNext = (path: string) => `/login?next=${encodeURIComponent(localePath(path, locale))}`;
  const pill = "press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-base font-semibold";
  const watching =
    watchers > 0 ? (
      <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-fail">
        <Eye className="size-4" aria-hidden /> {t.listing.watching(watchers)}
      </p>
    ) : null;

  if (isOwner) {
    return (
      <>
        <Link href={`/sell/listings/${listing.id}/edit`} className={`${pill} bg-surface text-ink ring-1 ring-slate-400 hover:bg-slate-100`}>
          {t.listing.editYourListing}
        </Link>
        {watching}
      </>
    );
  }
  if (listing.status !== "ACTIVE") {
    return (
      <p className="rounded-full bg-slate-100 px-3 py-3.5 text-center text-sm font-semibold text-slate-700">
        {listing.status === "SOLD" ? t.listing.sold : t.listing.reserved}
      </p>
    );
  }
  // The buyer's latest offer decides what the offer part of the box shows.
  const myOffers = user && listing.acceptsOffers ? await getMyOffersForListing(user.id, listing.id) : [];
  const latest = myOffers[0];
  const latestStatus = latest ? offerStatus(latest) : null;
  const canOffer = listing.acceptsOffers && latestStatus !== "PENDING" && latestStatus !== "ACCEPTED" && myOffers.length < MAX_OFFERS_PER_LISTING;
  const until = latest ? formatDateTime(latest.expiresAt, locale) : "";
  const inCart = user ? await isInCart(user.id, listing.id) : false;

  return (
    <>
      {latest && latestStatus === "ACCEPTED" && (
        <div className="space-y-2.5 rounded-2xl bg-emerald-50 p-3">
          <p className="text-sm text-emerald-900">{t.listing.offerAccepted(formatMoney(latest.amountIdr), until)}</p>
          <Link href={`/checkout/${listing.id}?offer=${latest.id}`} className={`${pill} bg-pass text-white hover:brightness-95`}>
            {t.listing.buyAtOffer(formatMoney(latest.amountIdr))}
          </Link>
        </div>
      )}
      <Link href={user ? `/checkout/${listing.id}` : loginNext(`/checkout/${listing.id}`)} className={`${pill} bg-brand-600 text-white hover:bg-action-hover`}>
        {t.listing.buyNow}
      </Link>
      {!user ? (
        <Link href={loginNext(`/listings/${listing.slug}`)} className={`${pill} bg-brand-50 text-brand-800 hover:bg-brand-100`}>
          <ShoppingCart className="size-4" aria-hidden /> {t.cart.addToCart}
        </Link>
      ) : inCart ? (
        <Link href="/cart" className={`${pill} bg-brand-50 text-brand-800 hover:bg-brand-100`}>
          <ShoppingCart className="size-4" aria-hidden /> {t.cart.inCart} · {t.cart.viewCart}
        </Link>
      ) : (
        <ActionButton action={addToCartAction.bind(null, listing.id)} variant="secondary" className="h-12 w-full rounded-full! bg-brand-50! text-base text-brand-800 ring-0! hover:bg-brand-100!">
          <ShoppingCart className="size-4" aria-hidden /> {t.cart.addToCart}
        </ActionButton>
      )}
      {latest && latestStatus === "PENDING" && (
        <div className="space-y-2 rounded-2xl bg-plate p-3 text-sm">
          <p className="text-ink">{t.listing.offerPending(formatMoney(latest.amountIdr), until)}</p>
          <ActionButton action={withdrawOfferAction.bind(null, latest.id)} variant="ghost" className="px-3 py-1.5">
            {t.listing.withdrawOffer}
          </ActionButton>
        </div>
      )}
      {latest && (latestStatus === "DECLINED" || latestStatus === "EXPIRED") && (
        <p className="text-center text-sm text-slate-600">
          {latestStatus === "DECLINED" ? t.listing.offerDeclined(formatMoney(latest.amountIdr)) : t.listing.offerExpired(formatMoney(latest.amountIdr))}{" "}
          {canOffer && t.listing.offersLeft(MAX_OFFERS_PER_LISTING - myOffers.length)}
        </p>
      )}
      {canOffer &&
        (user ? (
          <MakeOfferForm action={makeOfferAction.bind(null, listing.id)} min={formatMoney(minimumOffer(listing.priceIdr))} price={formatMoney(listing.priceIdr)} />
        ) : (
          <Link href={loginNext(`/listings/${listing.slug}`)} className={`${pill} bg-surface text-brand-700 ring-1 ring-brand-600 hover:bg-brand-50`}>
            {t.listing.makeOffer}
          </Link>
        ))}
      {user ? (
        <FavoriteButton listingId={listing.id} initial={favorited} />
      ) : (
        <Link href={loginNext(`/listings/${listing.slug}`)} className={`${pill} bg-surface text-brand-700 ring-1 ring-brand-600 hover:bg-brand-50`}>
          {t.listing.signInToSave}
        </Link>
      )}
      {watching}
    </>
  );
}

async function AboutSeller({ seller, listingId, locale, t }: { seller: ListingDetail["seller"]; listingId: string; locale: Locale; t: Dictionary }) {
  const reviews = await getRecentReviews(seller.id, 3);
  return (
    <section className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]" aria-labelledby="about-seller">
      <div className="card p-5">
        <h2 id="about-seller" className="text-xl font-extrabold">{t.listing.aboutSeller}</h2>
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-plate text-base font-bold text-ink" aria-hidden>
            {seller.displayName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <Link href={`/sellers/${seller.slug}`} className="block font-semibold text-ink hover:underline">
              {seller.displayName}
            </Link>
            <VerifiedBadge status={seller.verificationStatus} />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">{t.listing.sales}</dt>
            <dd className="num font-semibold text-ink">{seller.salesCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t.listing.memberSince}</dt>
            <dd className="font-semibold text-ink">{formatDate(seller.createdAt, locale)}</dd>
          </div>
        </dl>
        {seller.location && <p className="mt-3 text-sm text-slate-600">{seller.location}</p>}
        <Link
          href={`/sellers/${seller.slug}`}
          className="press mt-5 inline-flex h-10 w-full items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white hover:bg-action-hover"
        >
          {t.listing.visitStore}
        </Link>
        <Link
          href={`/account/messages/new?listing=${listingId}`}
          className="press mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-brand-700 ring-1 ring-brand-600 hover:bg-brand-50"
        >
          <MessageCircle className="size-4" aria-hidden /> {t.messages.contactSeller}
        </Link>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-extrabold">
            {t.listing.sellerFeedback} {seller.ratingCount > 0 && <span className="num text-base font-semibold text-slate-500">({seller.ratingCount})</span>}
          </h2>
          {seller.ratingCount > 0 && <Stars rating={seller.ratingAvg} />}
        </div>
        {reviews.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">{t.listing.noReviewsYet}</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule">
            {reviews.map((r) => (
              <li key={r.id} className="py-4 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars rating={r.rating} />
                  <span className="text-slate-500">
                    {r.buyer.name || t.common.deletedUser} · {formatDate(r.createdAt, locale)}
                  </span>
                </div>
                {r.comment && <p className="mt-1.5 text-slate-700">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
        {seller.ratingCount > reviews.length && (
          <Link href={`/sellers/${seller.slug}`} className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
            {t.listing.seeAllFeedback}
          </Link>
        )}
      </div>
    </section>
  );
}

async function Similar({ listingId, category, heading }: { listingId: string; category: string; heading: string }) {
  const items = await getSimilarListings(listingId, category, 6);
  if (!items.length) return null;
  return (
    <section className="mt-14" aria-labelledby="similar-heading">
      <h2 id="similar-heading" className="mb-5 text-2xl font-extrabold">{heading}</h2>
      <TileRow listings={items} />
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
