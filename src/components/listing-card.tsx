import Image from "next/image";
import Link from "next/link";
import { BatteryMedium, MapPin } from "lucide-react";
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

export function ListingCard({ listing, priority }: { listing: CardData; priority?: boolean }) {
  const cover = listing.images[0];
  const checks = parseChecks(listing.conditionReport?.checks);
  const discount =
    listing.originalPriceCents && listing.originalPriceCents > listing.priceCents
      ? Math.round((1 - listing.priceCents / listing.originalPriceCents) * 100)
      : 0;

  return (
    <article className="group card relative flex flex-col overflow-hidden transition-colors hover:border-slate-400">
      <Link href={`/listings/${listing.slug}`} className="relative block aspect-[4/3] bg-plate" tabIndex={-1} aria-hidden>
        {cover ? (
          <Image
            src={mediaUrl(cover.key)}
            alt=""
            fill
            sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 100vw"
            className="object-cover"
            priority={priority}
          />
        ) : null}
        {listing.status !== "ACTIVE" && (
          <span className="absolute top-3 left-3 rounded-[var(--radius-tag)] bg-ink px-2 py-0.5 text-xs font-semibold text-white">
            {listing.status === "SOLD" ? "Sold" : "Reserved"}
          </span>
        )}
      </Link>
      {checks.length > 0 && <ConditionStrip checks={checks} className="px-4 pt-3" />}
      <div className="flex flex-1 flex-col gap-2 px-4 pt-3 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <GradeBadge grade={listing.conditionGrade} />
          <WarrantyBadge type={listing.warrantyType} months={listing.warrantyMonths} />
        </div>
        <h3 className="line-clamp-2 text-[0.95rem] leading-snug font-semibold text-ink" style={{ fontStretch: "100%" }}>
          <Link href={`/listings/${listing.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {listing.title}
          </Link>
        </h3>
        {checks.length > 0 && <p className="text-xs text-slate-500">{stripLabel(checks)}</p>}
        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="num wide text-xl font-extrabold text-ink">{formatMoney(listing.priceCents)}</span>
          {discount >= 5 && listing.originalPriceCents && (
            <span className="num text-xs text-slate-500">
              <span className="line-through">{formatMoney(listing.originalPriceCents)}</span> new
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
      <div className="relative z-10 border-t border-rule px-4 py-2">
        <CompareToggle id={listing.id} title={listing.title} category={listing.category} />
      </div>
    </article>
  );
}

export function ListingGrid({ listings, priorityCount = 0 }: { listings: CardData[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {listings.map((l, i) => (
        <ListingCard key={l.id} listing={l} priority={i < priorityCount} />
      ))}
    </div>
  );
}
