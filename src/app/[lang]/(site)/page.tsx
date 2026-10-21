import Image from "next/image";
import { Search } from "lucide-react";
import { Link } from "@/i18n/client";
import { localePath, pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { CATEGORIES, getCategory } from "@/lib/catalog";
import { CHECK_STATUS_INFO } from "@/lib/constants";
import { getCategoryCounts, getFeaturedReport, getLatestListings, type ListingDetail } from "@/lib/data/catalog";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { GradeBadge, VerifiedBadge } from "@/components/badges";
import { ConditionStrip, stripLabel, summarizeChecks } from "@/components/condition-strip";
import { ListingGrid } from "@/components/listing-card";

export default async function HomePage() {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <section className="border-b border-rule bg-white">
        <div className="container-page grid gap-12 py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-16">
          <div className="max-w-xl">
            <h1 className="wide text-[2.5rem] leading-[1.02] font-extrabold tracking-[-0.035em] sm:text-[3.4rem] xl:text-[3.9rem]">
              {t.home.heading}
            </h1>
            <p className="mt-5 text-lg text-slate-600">{t.home.intro}</p>
            <form action={localePath("/listings", locale)} method="get" role="search" className="mt-8 flex max-w-lg gap-2">
              <label htmlFor="hero-search" className="sr-only">
                {t.nav.searchLabel}
              </label>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="hero-search"
                  name="q"
                  type="search"
                  maxLength={100}
                  placeholder={t.home.searchPlaceholder}
                  className="input h-12 pl-11 text-base"
                />
              </div>
              <button type="submit" className="h-12 rounded-lg bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
                {t.home.search}
              </button>
            </form>
            <CategoryChips />
          </div>
          <FeaturedReport />
        </div>
      </section>

      <section className="container-page py-14">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-extrabold">{t.home.justListed}</h2>
          <Link href="/listings" className="text-sm font-semibold text-brand-700 hover:underline">
            {t.home.browseAll}
          </Link>
        </div>
        <LatestListings />
      </section>

      <section className="border-t border-rule bg-white">
        <div className="container-page grid gap-10 py-14 lg:grid-cols-[18rem_1fr]">
          <div>
            <h2 className="text-2xl font-extrabold">{t.home.howBuyingWorks}</h2>
            <p className="mt-3 text-slate-600">{t.home.howBuyingIntro}</p>
            <Link href="/how-it-works#protection" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">
              {t.home.readProtection}
            </Link>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {t.home.steps.map(([title, body], i) => (
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
  const [locale, t, counts] = await Promise.all([getLocale(), getDictionary(), getCategoryCounts()]);
  return (
    <nav aria-label={t.home.shopByCategory} className="mt-6 flex flex-wrap gap-2">
      {CATEGORIES.map((c) => (
        <Link
          key={c.slug}
          href={`/c/${c.slug}`}
          className="inline-flex items-center gap-2 rounded-full border border-rule px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:text-ink"
        >
          {pick(c.name, locale)}
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
async function InspectionSheet({ listing }: { listing: ListingDetail }) {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  const report = listing.conditionReport!;
  const category = getCategory(listing.category);
  const labels = new Map(category?.checks.map((c) => [c.key, pick(c.label, locale)]));
  const checks = report.checks.map((c) => ({ ...c, label: c.label ?? labels.get(c.key) ?? c.key }));
  const s = summarizeChecks(checks);
  const flagged = checks.filter((c) => c.status === "MINOR" || c.status === "FAIL");
  const shown = [...flagged, ...checks.filter((c) => c.status === "PASS")].slice(0, 5);

  return (
    <Link
      href={`/listings/${listing.slug}`}
      className="group block rounded-2xl border border-rule bg-paper p-2 transition-colors hover:border-slate-400"
      aria-label={t.home.reportFor(listing.title)}
    >
      <div className="rounded-xl border border-rule bg-white">
        <div className="flex gap-4 p-5">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-plate">
            {listing.images[0] && <Image src={mediaUrl(listing.images[0].key)} alt="" fill sizes="80px" className="object-cover" priority />}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{t.home.conditionReport}</p>
            <p className="mt-0.5 leading-snug font-semibold text-ink">{listing.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <GradeBadge grade={listing.conditionGrade} />
              <span className="num text-sm font-bold">{formatMoney(listing.priceIdr)}</span>
              <VerifiedBadge status={listing.seller.verificationStatus} />
            </div>
          </div>
        </div>

        <div className="border-t border-rule px-5 py-5">
          <ConditionStrip checks={checks} label={stripLabel(checks, t.condition)} size="lg" animate />
          <dl className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <dt className="text-xs text-slate-500">{t.home.checksPassed}</dt>
              <dd className="num wide text-2xl font-extrabold">
                {s.pass}
                <span className="text-base text-slate-400">/{s.total - s.na}</span>
              </dd>
            </div>
            {report.batteryHealth != null && (
              <div>
                <dt className="text-xs text-slate-500">{t.home.batteryHealth}</dt>
                <dd className="num wide text-2xl font-extrabold">{report.batteryHealth}%</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-500">{t.home.cosmetic}</dt>
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
              <span className={`shrink-0 text-xs font-semibold ${CHECK_STATUS_INFO[c.status].tone}`}>{pick(CHECK_STATUS_INFO[c.status].label, locale)}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-rule px-5 py-3 text-sm font-semibold text-brand-700 group-hover:underline">{t.home.seeFullReport(s.total)}</p>
      </div>
    </Link>
  );
}

async function LatestListings() {
  const listings = await getLatestListings(8);
  return <ListingGrid listings={listings} priorityCount={4} />;
}
