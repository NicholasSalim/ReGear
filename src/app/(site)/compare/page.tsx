import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getCategory, formatSpecValue, type SpecField } from "@/lib/catalog";
import { batteryLabel, countIssues } from "@/lib/condition";
import { MAX_COMPARE } from "@/lib/constants";
import { getCompareListings, type ListingDetail } from "@/lib/data/catalog";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { GradeBadge, Stars, VerifiedBadge, warrantyLabel } from "@/components/badges";
import { RemoveFromCompare } from "@/components/compare";
import { ButtonLink, EmptyState, PageSkeleton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Compare listings",
  description: "Compare used electronics side by side: condition, battery health, specs, warranty and return terms.",
  robots: { index: false, follow: true },
};

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Compare listings</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Tick &ldquo;Compare&rdquo; on up to {MAX_COMPARE} listings to see them side by side. Best values are highlighted.
      </p>
      <Suspense fallback={<PageSkeleton />}>
        <CompareTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CompareTable({ searchParams }: { searchParams: PageProps<"/compare">["searchParams"] }) {
  const raw = (await searchParams).ids;
  const ids = [...new Set((typeof raw === "string" ? raw : "").split(",").filter((id) => /^[a-z0-9]{20,32}$/i.test(id)))].slice(0, MAX_COMPARE);
  const listings = ids.length ? await getCompareListings(ids) : [];

  if (listings.length < 2) {
    return (
      <EmptyState
        title="Pick at least two listings to compare"
        description="Use the Compare checkbox on any listing card or product page."
        action={<ButtonLink href="/listings">Browse listings</ButtonLink>}
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
    price: Math.min(...listings.map((l) => l.priceCents + l.shippingCents)),
    functional: Math.max(...listings.map((l) => l.conditionReport?.functionalScore ?? 0)),
    cosmetic: Math.max(...listings.map((l) => l.conditionReport?.cosmeticScore ?? 0)),
    battery: Math.max(...listings.map((l) => l.conditionReport?.batteryHealth ?? 0)),
    warranty: Math.max(...listings.map((l) => l.warrantyMonths)),
    returns: Math.max(...listings.map((l) => l.returnWindowDays)),
  };

  type Row = { label: string; render: (l: ListingDetail) => React.ReactNode; isBest?: (l: ListingDetail) => boolean };
  const rows: Row[] = [
    { label: "Price + shipping", render: (l) => formatMoney(l.priceCents + l.shippingCents), isBest: (l) => l.priceCents + l.shippingCents === best.price },
    { label: "Condition grade", render: (l) => <GradeBadge grade={l.conditionGrade} /> },
    { label: "Functional score", render: (l) => `${l.conditionReport?.functionalScore ?? "—"}/100`, isBest: (l) => (l.conditionReport?.functionalScore ?? -1) === best.functional },
    { label: "Cosmetic score", render: (l) => `${l.conditionReport?.cosmeticScore ?? "—"}/10`, isBest: (l) => (l.conditionReport?.cosmeticScore ?? -1) === best.cosmetic },
    {
      label: "Battery health",
      render: (l) => {
        const b = l.conditionReport?.batteryHealth;
        const info = batteryLabel(b);
        return b != null ? <span>{b}% <span className={`text-xs ${info?.tone}`}>{info?.label}</span></span> : "—";
      },
      isBest: (l) => best.battery > 0 && l.conditionReport?.batteryHealth === best.battery,
    },
    {
      label: "Issues reported",
      render: (l) => {
        const i = countIssues(l.conditionReport?.checks ?? []);
        return i.minor + i.failed === 0 ? "None" : `${i.failed} failed, ${i.minor} minor`;
      },
    },
    ...specFields.map<Row>((f) => ({ label: f.label, render: (l) => (getCategory(l.category)?.specFields.some((x) => x.key === f.key) ? formatSpecValue(f, l.specs[f.key]) : "n/a") })),
    { label: "Warranty", render: (l) => (l.warrantyType === "NONE" ? "None" : `${warrantyLabel(l.warrantyType)}, ${l.warrantyMonths} months`), isBest: (l) => best.warranty > 0 && l.warrantyMonths === best.warranty },
    { label: "Return window", render: (l) => (l.returnWindowDays ? `${l.returnWindowDays} days` : "No returns"), isBest: (l) => best.returns > 0 && l.returnWindowDays === best.returns },
    { label: "Seller", render: (l) => <span className="space-y-1"><Link href={`/sellers/${l.seller.slug}`} className="block font-medium hover:text-brand-700">{l.seller.displayName}</Link><VerifiedBadge status={l.seller.verificationStatus} />{l.seller.ratingCount > 0 && <Stars rating={l.seller.ratingAvg} count={l.seller.ratingCount} />}</span> },
    { label: "Ships from", render: (l) => l.location },
  ];

  return (
    <>
      {categories.size > 1 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You are comparing items from different categories; some specifications don&apos;t apply to every item.
        </p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Side-by-side comparison of selected listings</caption>
          <thead>
            <tr>
              <th scope="col" className="w-44 p-4 text-left align-bottom text-sm font-semibold text-slate-500"><span className="sr-only">Listing</span></th>
              {listings.map((l) => (
                <th key={l.id} scope="col" className="p-4 text-left align-top font-normal">
                  <Link href={`/listings/${l.slug}`} className="block">
                    <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
                      {l.images[0] && <Image src={mediaUrl(l.images[0].key)} alt={l.title} fill sizes="240px" className="object-cover" />}
                    </div>
                    <span className="line-clamp-2 font-semibold text-ink hover:text-brand-700">{l.title}</span>
                  </Link>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-slate-500">{l.status === "ACTIVE" ? "Available" : l.status.toLowerCase()}</span>
                    <RemoveFromCompare id={l.id} />
                  </div>
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
