import Image from "next/image";
import { BatteryMedium, MapPin } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { categoryName } from "@/lib/catalog";
import type { ListingCard as ListingCardData } from "@/lib/data/catalog";
import type { ConditionCheckEntry } from "@/lib/condition";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { GradeBadge, VerifiedBadge, WarrantyBadge } from "@/components/badges";
import { CompareToggle } from "@/components/compare";
import { ConditionStrip, stripLabel } from "@/components/condition-strip";

type CardData = Omit<ListingCardData, "conditionReport"> & {
  conditionReport: { batteryHealth: number | null; functionalScore: number; checks?: string } | null;
};

function parseChecks(raw?: string): ConditionCheckEntry[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ConditionCheckEntry[];
  } catch {
    return [];
  }
}

export async function ListingCard({ listing, priority }: { listing: CardData; priority?: boolean }) {
  const t = await getDictionary();
  const cover = listing.images[0];
  const checks = parseChecks(listing.conditionReport?.checks);
  const discount =
    listing.originalPriceIdr && listing.originalPriceIdr > listing.priceIdr
      ? Math.round((1 - listing.priceIdr / listing.originalPriceIdr) * 100)
      : 0;

  return (
    <article className="group card relative flex flex-col overflow-hidden transition-colors hover:border-slate-400">
      <Link href={`/listings/${listing.slug}`} className="relative block aspect-[4/3] bg-plate" tabIndex={-1} aria-hidden>
        {cover ? (
          <Image
            src={mediaUrl(cover.key)}
            alt=""
            fill
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 30vw, 50vw"
            className="object-cover"
            priority={priority}
          />
        ) : null}
        {listing.status !== "ACTIVE" && (
          <span className="absolute top-3 left-3 rounded-[var(--radius-tag)] bg-inverse px-2 py-0.5 text-xs font-semibold text-white">
            {listing.status === "SOLD" ? t.listing.soldTag : t.listing.reservedTag}
          </span>
        )}
      </Link>
      {checks.length > 0 && <ConditionStrip checks={checks} label={stripLabel(checks, t.condition)} className="px-3 pt-2.5 sm:px-4 sm:pt-3" />}
      <div className="flex flex-1 flex-col gap-1.5 px-3 pt-2.5 pb-3 sm:gap-2 sm:px-4 sm:pt-3 sm:pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <GradeBadge grade={listing.conditionGrade} />
          <WarrantyBadge type={listing.warrantyType} months={listing.warrantyMonths} />
        </div>
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-ink sm:text-[0.95rem]" style={{ fontStretch: "100%" }}>
          <Link href={`/listings/${listing.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {listing.title}
          </Link>
        </h3>
        {checks.length > 0 && <p className="text-xs text-slate-500 max-sm:hidden">{stripLabel(checks, t.condition)}</p>}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
          <span className="num wide text-xl font-extrabold text-ink max-sm:text-base max-sm:[font-stretch:100%]">{formatMoney(listing.priceIdr)}</span>
          {discount >= 5 && listing.originalPriceIdr && (
            <span className="num text-xs text-slate-500">
              <span className="line-through">{formatMoney(listing.originalPriceIdr)}</span> {t.listing.newSuffix}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {listing.conditionReport?.batteryHealth != null && (
            <span className="inline-flex items-center gap-1">
              <BatteryMedium className="size-3.5" aria-hidden /> {listing.conditionReport.batteryHealth}%
            </span>
          )}
          {listing.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {listing.location}
            </span>
          )}
          <VerifiedBadge status={listing.seller.verificationStatus} />
        </div>
      </div>
      <div className="relative z-10 border-t border-rule px-3 py-2 sm:px-4">
        <CompareToggle id={listing.id} title={listing.title} category={listing.category} />
      </div>
    </article>
  );
}

/**
 * A search result as a wide row: the photo on the left, then everything a buyer
 * compares at a glance (condition, price with shipping, where from, who sells).
 */
export async function ListingRow({ listing, priority }: { listing: CardData; priority?: boolean }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const cover = listing.images[0];
  const checks = parseChecks(listing.conditionReport?.checks);
  const discount =
    listing.originalPriceIdr && listing.originalPriceIdr > listing.priceIdr
      ? Math.round((1 - listing.priceIdr / listing.originalPriceIdr) * 100)
      : 0;
  const { seller } = listing;
  return (
    <article className="group relative flex gap-4 border-b border-rule py-5 first:pt-0 sm:gap-6">
      <div className="relative aspect-square w-32 shrink-0 self-start overflow-hidden rounded-xl bg-plate sm:w-48 lg:w-52">
        {cover && <Image src={mediaUrl(cover.key)} alt="" fill sizes="(min-width: 1024px) 208px, (min-width: 640px) 192px, 128px" className="object-cover" priority={priority} />}
        {listing.status !== "ACTIVE" && (
          <span className="absolute top-2 left-2 rounded-[var(--radius-tag)] bg-inverse px-2 py-0.5 text-xs font-semibold text-white">
            {listing.status === "SOLD" ? t.listing.soldTag : t.listing.reservedTag}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:gap-6">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] leading-snug font-medium text-ink sm:text-lg" style={{ fontStretch: "100%" }}>
            <Link href={`/listings/${listing.slug}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline">
              {listing.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {[listing.brand, listing.model, categoryName(listing.category, locale)].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <GradeBadge grade={listing.conditionGrade} />
            <WarrantyBadge type={listing.warrantyType} months={listing.warrantyMonths} />
          </div>
          {checks.length > 0 && (
            <div className="mt-2.5 max-w-60">
              <ConditionStrip checks={checks} label={stripLabel(checks, t.condition)} />
              <p className="mt-1 text-xs text-slate-500">{stripLabel(checks, t.condition)}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 sm:w-52 sm:shrink-0">
          <p className="num wide text-xl font-extrabold text-ink sm:text-2xl max-sm:[font-stretch:100%]">{formatMoney(listing.priceIdr)}</p>
          {listing.acceptsOffers && listing.status === "ACTIVE" && <p className="text-sm text-slate-600">{t.listing.orBestOffer}</p>}
          {discount >= 5 && listing.originalPriceIdr && (
            <p className="num text-xs text-slate-500">
              <span className="line-through">{formatMoney(listing.originalPriceIdr)}</span> {t.listing.newSuffix} ·{" "}
              <span className="font-semibold text-pass">{t.home.percentOff(discount)}</span>
            </p>
          )}
          <p className={`text-sm ${listing.shippingIdr ? "text-slate-600" : "font-semibold text-ink"}`}>
            {listing.shippingIdr ? t.listing.plusShipping(formatMoney(listing.shippingIdr)) : t.listing.freeShipping}
          </p>
          {listing.location && <p className="text-sm text-slate-600">{t.browse.fromLocation(listing.location)}</p>}
          {listing.conditionReport?.batteryHealth != null && (
            <p className="inline-flex items-center gap-1 text-sm text-slate-600">
              <BatteryMedium className="size-4" aria-hidden /> {listing.conditionReport.batteryHealth}%
            </p>
          )}
          <p className="mt-1 text-xs text-slate-600">
            {seller.displayName}{" "}
            <span className="text-slate-500">
              {seller.ratingCount ? t.browse.sellerRating(seller.ratingAvg.toFixed(1), seller.ratingCount) : t.browse.newSeller}
            </span>
          </p>
          <VerifiedBadge status={seller.verificationStatus} />
          <div className="relative z-10 mt-2">
            <CompareToggle id={listing.id} title={listing.title} category={listing.category} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function ListingList({ listings, priorityCount = 0 }: { listings: CardData[]; priorityCount?: number }) {
  return (
    <div>
      {listings.map((l, i) => (
        <ListingRow key={l.id} listing={l} priority={i < priorityCount} />
      ))}
    </div>
  );
}

/** A compact card for the home page's rows: photo, title and price, as in a shop window. */
export async function ListingTile({ listing }: { listing: CardData }) {
  const t = await getDictionary();
  const cover = listing.images[0];
  const discount =
    listing.originalPriceIdr && listing.originalPriceIdr > listing.priceIdr
      ? Math.round((1 - listing.priceIdr / listing.originalPriceIdr) * 100)
      : 0;
  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-plate">
        {cover && (
          <Image
            src={mediaUrl(cover.key)}
            alt=""
            fill
            sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 45vw"
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        )}
        {discount >= 5 && (
          <span className="absolute top-2 left-2 rounded-[var(--radius-tag)] bg-danger px-1.5 py-0.5 text-xs font-bold text-white">
            −{discount}%
          </span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm leading-snug text-ink">
        <Link href={`/listings/${listing.slug}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline">
          {listing.title}
        </Link>
      </h3>
      <p className="num mt-1 text-base font-bold text-ink">{formatMoney(listing.priceIdr)}</p>
      {discount >= 5 && listing.originalPriceIdr && (
        <p className="num text-xs text-slate-500">
          <span className="line-through">{formatMoney(listing.originalPriceIdr)}</span> {t.listing.newSuffix}
        </p>
      )}
      <div className="mt-1">
        <GradeBadge grade={listing.conditionGrade} />
      </div>
    </article>
  );
}

/** A row of tiles that wraps instead of scrolling sideways: two across on phones, six on wide screens. */
export function TileRow({ listings }: { listings: CardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
      {listings.map((l) => (
        <ListingTile key={l.id} listing={l} />
      ))}
    </div>
  );
}

export function ListingGrid({ listings, priorityCount = 0 }: { listings: CardData[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {listings.map((l, i) => (
        <ListingCard key={l.id} listing={l} priority={i < priorityCount} />
      ))}
    </div>
  );
}
