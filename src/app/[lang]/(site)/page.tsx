import Image from "next/image";
import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { CATEGORIES, getCategory } from "@/lib/catalog";
import { CHECK_STATUS_INFO } from "@/lib/constants";
import {
  getCategoryCounts,
  getCategoryCovers,
  getDeals,
  getFeaturedReport,
  getLatestListings,
  getTopBrands,
  type ListingDetail,
} from "@/lib/data/catalog";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { GradeBadge, VerifiedBadge } from "@/components/badges";
import { ConditionStrip, stripLabel, summarizeChecks } from "@/components/condition-strip";
import { CategoryIcon } from "@/components/category-icon";
import { RecentlyViewed } from "@/components/recently-viewed";
import { TileRow } from "@/components/listing-card";

// The front page reads like a department store's: a banner, the departments,
// then shelves of things to buy, and an invitation to sell at the end.
export default async function HomePage() {
  const t = await getDictionary();
  return (
    <div className="pb-4">
      <section className="container-page pt-6">
        <div className="grid grid-cols-1 gap-10 rounded-3xl bg-inverse px-6 py-10 text-white sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-12">
          <div className="max-w-xl">
            <h1 className="wide text-[2.1rem] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[2.7rem] xl:text-[3.1rem]">{t.home.heading}</h1>
            <p className="mt-4 text-base text-white/75 sm:text-lg">{t.home.intro}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/listings" className="press inline-flex h-11 items-center rounded-full bg-white px-6 font-semibold text-[#1a2233] hover:bg-white/90">
                {t.home.shopNow}
              </Link>
              <Link
                href="/sell/listings/new"
                className="press inline-flex h-11 items-center rounded-full px-5 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10"
              >
                {t.home.sellYourGear}
              </Link>
            </div>
            <Link href="/how-it-works" className="mt-5 inline-block text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
              {t.home.seeHowItWorks}
            </Link>
          </div>
          <FeaturedReport />
        </div>
      </section>

      <CategoryTiles />

      <RecentlyViewed title={t.home.recentlyViewed} clear={t.home.clearRecent} />
      <Deals />
      <JustListed />
      <Brands />
      <SellBanner />
    </div>
  );
}

/** The departments as picture tiles, each showing something that's actually for sale there. */
async function CategoryTiles() {
  const [locale, t, counts, covers] = await Promise.all([getLocale(), getDictionary(), getCategoryCounts(), getCategoryCovers()]);
  return (
    <section className="container-page pt-12" aria-labelledby="shop-by-category">
      <h2 id="shop-by-category" className="text-2xl font-extrabold">
        {t.home.shopByCategory}
      </h2>
      <ul className="mt-5 grid grid-cols-4 gap-x-3 gap-y-5 sm:gap-x-4 lg:grid-cols-8">
        {CATEGORIES.map((c) => {
          const cover = covers[c.slug];
          return (
            <li key={c.slug}>
              <Link href={`/c/${c.slug}`} className="group block text-center">
                <span className="relative block aspect-square overflow-hidden rounded-2xl bg-plate">
                  {cover ? (
                    <Image
                      src={mediaUrl(cover)}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 140px, 22vw"
                      className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                    />
                  ) : (
                    <CategoryIcon slug={c.slug} className="absolute inset-0 m-auto size-1/3 text-slate-400" />
                  )}
                </span>
                <span className="mt-2 block text-xs leading-snug font-medium text-ink group-hover:underline sm:text-sm">{pick(c.name, locale)}</span>
                <span className="num block text-xs text-slate-500">{counts[c.slug] ?? 0}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
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
  const shown = [...flagged, ...checks.filter((c) => c.status === "PASS")].slice(0, 3);

  return (
    <Link
      href={`/listings/${listing.slug}`}
      className="group block rounded-2xl bg-white/10 p-2 text-ink transition-colors hover:bg-white/15"
      aria-label={t.home.reportFor(listing.title)}
    >
      <div className="rounded-xl border border-rule bg-surface">
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

async function Deals() {
  const [t, deals] = await Promise.all([getDictionary(), getDeals(6)]);
  if (!deals.length) return null;
  return (
    <Shelf title={t.home.deals} href="/deals" more={t.home.seeAll}>
      <TileRow listings={deals} />
    </Shelf>
  );
}

async function JustListed() {
  const [t, listings] = await Promise.all([getDictionary(), getLatestListings(12)]);
  return (
    <Shelf title={t.home.justListed} href="/listings" more={t.home.browseAll}>
      <TileRow listings={listings} />
    </Shelf>
  );
}

async function Brands() {
  const [t, brands] = await Promise.all([getDictionary(), getTopBrands(14)]);
  if (!brands.length) return null;
  return (
    <section className="container-page pt-12">
      <h2 className="text-2xl font-extrabold">{t.home.brands}</h2>
      <ul className="mt-5 flex flex-wrap gap-2">
        {brands.map((b) => (
          <li key={b.brand}>
            <Link
              href={`/listings?brand=${encodeURIComponent(b.brand)}`}
              className="press inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-slate-400"
            >
              {b.brand}
              <span className="num text-xs text-slate-400">{b.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function SellBanner() {
  const t = await getDictionary();
  return (
    <section className="container-page pt-14">
      <div className="flex flex-col gap-6 rounded-3xl bg-inverse px-6 py-10 text-white sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:py-12">
        <div>
          <h2 className="wide text-3xl leading-tight font-extrabold sm:text-4xl">{t.home.sellTitle}</h2>
          <p className="mt-3 max-w-lg text-white/75">{t.home.sellBody}</p>
        </div>
        <Link
          href="/sell/listings/new"
          className="press inline-flex h-11 shrink-0 items-center self-start rounded-full bg-white px-6 font-semibold text-[#1a2233] hover:bg-white/90 lg:self-auto"
        >
          {t.home.sellCta}
        </Link>
      </div>
    </section>
  );
}

/** A titled row of tiles with a link to the rest, as on a department store's front page. */
function Shelf({ title, href, more, children }: { title: string; href: string; more: string; children: React.ReactNode }) {
  return (
    <section className="container-page pt-12">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="text-2xl font-extrabold">{title}</h2>
        <Link href={href} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
          {more}
        </Link>
      </div>
      {children}
    </section>
  );
}
