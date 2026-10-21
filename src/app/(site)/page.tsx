import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { CATEGORIES, getCategory } from "@/lib/catalog";
import { CHECK_STATUS_INFO } from "@/lib/constants";
import { getCategoryCounts, getFeaturedReport, getLatestListings, type ListingDetail } from "@/lib/data/catalog";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { GradeBadge, VerifiedBadge } from "@/components/badges";
import { ConditionStrip, summarizeChecks } from "@/components/condition-strip";
import { ListingGrid } from "@/components/listing-card";

export default function HomePage() {
  return (
    <>
      <section className="border-b border-rule bg-white">
        <div className="container-page grid gap-12 py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-16">
          <div className="max-w-xl">
            <h1 className="wide text-[2.5rem] leading-[1.02] font-extrabold tracking-[-0.035em] sm:text-[3.4rem] xl:text-[3.9rem]">
              Know the condition before you buy.
            </h1>
            <p className="mt-5 text-lg text-slate-600">
              Every listing on ReGear comes with a checklist of what works, what&apos;s worn and what doesn&apos;t, filled in for that exact
              device. Used electronics, minus the guesswork.
            </p>
            <form action="/listings" method="get" role="search" className="mt-8 flex max-w-lg gap-2">
              <label htmlFor="hero-search" className="sr-only">
                Search used electronics
              </label>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="hero-search"
                  name="q"
                  type="search"
                  maxLength={100}
                  placeholder="iPhone 14, RTX 3080, Sony A7…"
                  className="input h-12 pl-11 text-base"
                />
              </div>
              <button type="submit" className="h-12 rounded-lg bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
                Search
              </button>
            </form>
            <CategoryChips />
          </div>
          <FeaturedReport />
        </div>
      </section>

      <section className="container-page py-14">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-extrabold">Just listed</h2>
          <Link href="/listings" className="text-sm font-semibold text-brand-700 hover:underline">
            Browse all listings
          </Link>
        </div>
        <LatestListings />
      </section>

      <section className="border-t border-rule bg-white">
        <div className="container-page grid gap-10 py-14 lg:grid-cols-[18rem_1fr]">
          <div>
            <h2 className="text-2xl font-extrabold">How buying works</h2>
            <p className="mt-3 text-slate-600">
              Your money stays with ReGear until you&apos;ve checked the item against its report.
            </p>
            <Link href="/how-it-works#protection" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">
              Read about buyer protection
            </Link>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Pay into escrow", "The seller sees the order but not the money."],
              ["Seller ships", "You get a carrier and tracking number on your order page."],
              ["Check it against the report", "Every line of the checklist should match what you received."],
              ["Accept or return", "Accepting pays the seller. If it doesn't match, request a return or open a dispute."],
            ].map(([title, body], i) => (
              <li key={title} className="bg-white p-5">
                <span className="num wide block text-3xl font-extrabold text-brand-600">{i + 1}</span>
                <h3 className="mt-3 font-bold" style={{ fontStretch: "100%" }}>{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

async function CategoryChips() {
  const counts = await getCategoryCounts();
  return (
    <nav aria-label="Shop by category" className="mt-6 flex flex-wrap gap-2">
      {CATEGORIES.map((c) => (
        <Link
          key={c.slug}
          href={`/c/${c.slug}`}
          className="inline-flex items-center gap-2 rounded-full border border-rule px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:text-ink"
        >
          {c.name}
          <span className="num text-xs text-slate-400">{counts[c.slug] ?? 0}</span>
        </Link>
      ))}
    </nav>
  );
}

async function FeaturedReport() {
  const listing = await getFeaturedReport();
  if (!listing?.conditionReport) return null;
  return <InspectionSheet listing={listing} />;
}

/** A real condition report rendered as an inspection sheet. */
function InspectionSheet({ listing }: { listing: ListingDetail }) {
  const report = listing.conditionReport!;
  const category = getCategory(listing.category);
  const labels = new Map(category?.checks.map((c) => [c.key, c.label]));
  const checks = report.checks.map((c) => ({ ...c, label: labels.get(c.key) ?? c.key }));
  const s = summarizeChecks(checks);
  const flagged = checks.filter((c) => c.status === "MINOR" || c.status === "FAIL");
  const shown = [...flagged, ...checks.filter((c) => c.status === "PASS")].slice(0, 5);

  return (
    <Link
      href={`/listings/${listing.slug}`}
      className="group block rounded-2xl border border-rule bg-paper p-2 transition-colors hover:border-slate-400"
      aria-label={`Condition report for ${listing.title}`}
    >
      <div className="rounded-xl border border-rule bg-white">
        <div className="flex gap-4 p-5">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-plate">
            {listing.images[0] && <Image src={mediaUrl(listing.images[0].key)} alt="" fill sizes="80px" className="object-cover" priority />}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-slate-500">Condition report</p>
            <p className="mt-0.5 leading-snug font-semibold text-ink">{listing.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <GradeBadge grade={listing.conditionGrade} />
              <span className="num text-sm font-bold">{formatMoney(listing.priceCents)}</span>
              <VerifiedBadge status={listing.seller.verificationStatus} />
            </div>
          </div>
        </div>

        <div className="border-t border-rule px-5 py-5">
          <ConditionStrip checks={checks} size="lg" animate />
          <dl className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <dt className="text-xs text-slate-500">Checks passed</dt>
              <dd className="num wide text-2xl font-extrabold">
                {s.pass}
                <span className="text-base text-slate-400">/{s.total - s.na}</span>
              </dd>
            </div>
            {report.batteryHealth != null && (
              <div>
                <dt className="text-xs text-slate-500">Battery health</dt>
                <dd className="num wide text-2xl font-extrabold">{report.batteryHealth}%</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-500">Cosmetic</dt>
              <dd className="num wide text-2xl font-extrabold">
                {report.cosmeticScore}
                <span className="text-base text-slate-400">/10</span>
              </dd>
            </div>
          </dl>
        </div>

        <ul className="divide-y divide-rule border-t border-rule text-sm">
          {shown.map((c) => (
            <li key={c.key} className="flex items-start gap-3 px-5 py-2.5">
              <span
                aria-hidden
                className={`mt-1.5 size-2 shrink-0 rounded-[2px] ${c.status === "PASS" ? "bg-pass" : c.status === "MINOR" ? "bg-minor" : c.status === "FAIL" ? "bg-fail" : "bg-na"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.label}</span>
                {c.note && <span className="block text-slate-500">{c.note}</span>}
              </span>
              <span className={`shrink-0 text-xs font-semibold ${CHECK_STATUS_INFO[c.status].tone}`}>{CHECK_STATUS_INFO[c.status].label}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-rule px-5 py-3 text-sm font-semibold text-brand-700 group-hover:underline">
          See the full report ({s.total} checks)
        </p>
      </div>
    </Link>
  );
}

async function LatestListings() {
  const listings = await getLatestListings(8);
  return <ListingGrid listings={listings} priorityCount={4} />;
}
