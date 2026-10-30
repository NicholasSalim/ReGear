import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCategory, formatSpecValue, type SpecField } from "@/lib/catalog";
import { batteryLabel, countIssues } from "@/lib/condition";
import { LISTING_STATUS_LABELS, MAX_COMPARE, type ListingStatus } from "@/lib/constants";
import { getCompareListings, type ListingDetail } from "@/lib/data/catalog";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { GradeBadge, Stars, VerifiedBadge, warrantyLabel } from "@/components/badges";
import { RemoveFromCompare } from "@/components/compare";
import { ButtonLink, EmptyState, PageSkeleton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.compare.metaTitle, description: t.compare.metaDescription, robots: { index: false, follow: true } };
}

export default async function ComparePage({ searchParams }: PageProps<"/[lang]/compare">) {
  const t = await getDictionary();
  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.compare.heading}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">{t.compare.intro(MAX_COMPARE)}</p>
      <Suspense fallback={<PageSkeleton />}>
        <CompareTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CompareTable({ searchParams }: { searchParams: PageProps<"/[lang]/compare">["searchParams"] }) {
  const raw = (await searchParams).ids;
  const ids = [...new Set((typeof raw === "string" ? raw : "").split(",").filter((id) => /^[a-z0-9]{20,32}$/i.test(id)))].slice(0, MAX_COMPARE);
  const [listings, locale, t] = await Promise.all([ids.length ? getCompareListings(ids) : [], getLocale(), getDictionary()]);

  if (listings.length < 2) {
    return (
      <EmptyState
        title={t.compare.pickTwo}
        description={t.compare.pickTwoHint}
        action={<ButtonLink href="/listings">{t.common.browseListings}</ButtonLink>}
      />
    );
  }

  const categories = new Set(listings.map((l) => l.category));
  // Union of spec fields across all compared categories, in catalogue order.
  const specFields: SpecField[] = [];
  for (const slug of categories) {
    for (const f of getCategory(slug)?.specFields ?? []) {
      if (!specFields.some((x) => x.key === f.key)) specFields.push(f);
    }
  }

  const best = {
    price: Math.min(...listings.map((l) => l.priceIdr + l.shippingIdr)),
    functional: Math.max(...listings.map((l) => l.conditionReport?.functionalScore ?? 0)),
    cosmetic: Math.max(...listings.map((l) => l.conditionReport?.cosmeticScore ?? 0)),
    battery: Math.max(...listings.map((l) => l.conditionReport?.batteryHealth ?? 0)),
    warranty: Math.max(...listings.map((l) => l.warrantyMonths)),
    returns: Math.max(...listings.map((l) => l.returnWindowDays)),
  };

  const r = t.compare.rows;
  type Row = { label: string; render: (l: ListingDetail) => React.ReactNode; isBest?: (l: ListingDetail) => boolean };
  const rows: Row[] = [
    { label: r.priceShipping, render: (l) => formatMoney(l.priceIdr + l.shippingIdr), isBest: (l) => l.priceIdr + l.shippingIdr === best.price },
    { label: r.grade, render: (l) => <GradeBadge grade={l.conditionGrade} /> },
    { label: r.functional, render: (l) => `${l.conditionReport?.functionalScore ?? "—"}/100`, isBest: (l) => (l.conditionReport?.functionalScore ?? -1) === best.functional },
    { label: r.cosmetic, render: (l) => `${l.conditionReport?.cosmeticScore ?? "—"}/10`, isBest: (l) => (l.conditionReport?.cosmeticScore ?? -1) === best.cosmetic },
    {
      label: r.battery,
      render: (l) => {
        const b = l.conditionReport?.batteryHealth;
        const info = batteryLabel(b);
        return b != null ? <span>{b}% {info && <span className={`text-xs ${info.tone}`}>{t.battery[info.level]}</span>}</span> : "—";
      },
      isBest: (l) => best.battery > 0 && l.conditionReport?.batteryHealth === best.battery,
    },
    {
      label: r.issues,
      render: (l) => {
        const i = countIssues(l.conditionReport?.checks ?? []);
        return i.minor + i.failed === 0 ? t.common.none : t.compare.issuesSummary(i.failed, i.minor);
      },
    },
    ...specFields.map<Row>((f) => ({
      label: pick(f.label, locale),
      render: (l) => (getCategory(l.category)?.specFields.some((x) => x.key === f.key) ? formatSpecValue(f, l.specs[f.key], locale) : t.common.notApplicable),
    })),
    {
      label: r.warranty,
      render: (l) => (l.warrantyType === "NONE" ? t.common.none : t.compare.warrantySummary(warrantyLabel(l.warrantyType, locale), l.warrantyMonths)),
      isBest: (l) => best.warranty > 0 && l.warrantyMonths === best.warranty,
    },
    { label: r.returns, render: (l) => (l.returnWindowDays ? t.compare.returnDays(l.returnWindowDays) : t.compare.noReturns), isBest: (l) => best.returns > 0 && l.returnWindowDays === best.returns },
    { label: r.seller, render: (l) => <span className="space-y-1"><Link href={`/sellers/${l.seller.slug}`} className="block font-medium hover:text-brand-700">{l.seller.displayName}</Link><VerifiedBadge status={l.seller.verificationStatus} />{l.seller.ratingCount > 0 && <Stars rating={l.seller.ratingAvg} count={l.seller.ratingCount} />}</span> },
    { label: r.shipsFrom, render: (l) => l.location },
  ];

  const statusLabel = (status: string) => {
    if (status === "ACTIVE") return t.compare.available;
    const label = LISTING_STATUS_LABELS[status as ListingStatus];
    return label ? pick(label, locale) : status;
  };

  const itemHead = (l: ListingDetail, sizes: string) => (
    <>
      <Link href={`/listings/${l.slug}`} className="block">
        <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
          {l.images[0] && <Image src={mediaUrl(l.images[0].key)} alt={l.title} fill sizes={sizes} className="object-cover" />}
        </div>
        <span className="line-clamp-2 font-semibold text-ink hover:text-brand-700">{l.title}</span>
      </Link>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{statusLabel(l.status)}</span>
        <RemoveFromCompare id={l.id} shown={listings.map((other) => other.id)} />
      </div>
    </>
  );

  return (
    <>
      {categories.size > 1 && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.compare.mixedCategories}</p>}
      {/* Phones: one block per attribute, with every item's value listed underneath, so the page only scrolls down. */}
      <div className="md:hidden">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {listings.map((l) => (
            <div key={l.id} className="card p-3">
              {itemHead(l, "50vw")}
            </div>
          ))}
        </div>
        <dl className="card mt-4 divide-y divide-slate-100 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="p-4">
              <dt className="mb-1.5 font-semibold text-ink">{row.label}</dt>
              <dd>
                <ul className="-mx-2 space-y-0.5">
                  {listings.map((l) => (
                    <li key={l.id} className={`flex items-start justify-between gap-3 rounded-md px-2 py-1.5 ${row.isBest?.(l) ? "bg-brand-50 font-semibold text-brand-900" : ""}`}>
                      <span className="min-w-0 flex-1 truncate text-xs leading-5 font-normal text-slate-600">{l.title}</span>
                      <span className="max-w-[60%] text-right">{row.render(l)}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="card overflow-x-auto max-md:hidden">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">{t.compare.caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-44 p-4 text-left align-bottom text-sm font-semibold text-slate-500"><span className="sr-only">{t.compare.listing}</span></th>
              {listings.map((l) => (
                <th key={l.id} scope="col" className="p-4 text-left align-top font-normal">
                  {itemHead(l, "240px")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <th scope="row" className="p-4 text-left font-medium text-slate-600">{row.label}</th>
                {listings.map((l) => (
                  <td key={l.id} className={`p-4 align-top ${row.isBest?.(l) ? "bg-brand-50 font-semibold text-brand-900" : ""}`}>
                    {row.render(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
