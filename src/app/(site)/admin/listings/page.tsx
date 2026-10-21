import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDate, formatMoney } from "@/lib/format";
import { moderateListingAction } from "@/actions/admin";
import { ListingStatusBadge, VerifiedBadge } from "@/components/badges";
import { PageHeader } from "@/components/ui";
import { ModerateForm } from "../admin-forms";

export const metadata: Metadata = { title: "Listings" };

export default async function AdminListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  await requireAdmin();
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q.trim().toLowerCase().slice(0, 100) : "";
  const listings = await db.listing.findMany({
    where: { status: { in: ["ACTIVE", "DRAFT"] }, ...(query ? { searchText: { contains: query } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      priceCents: true,
      createdAt: true,
      seller: { select: { displayName: true, verificationStatus: true } },
    },
  });

  return (
    <>
      <PageHeader title="Listing moderation" description="Remove listings that violate policy (counterfeits, prohibited items, misleading reports)." />
      <form method="get" className="mb-4 flex gap-2">
        <input name="q" defaultValue={query} placeholder="Search listings" aria-label="Search listings" className="input max-w-sm" />
        <button className="rounded-lg bg-ink px-4 text-sm font-semibold text-white">Search</button>
      </form>
      <ul className="card divide-y divide-slate-100">
        {listings.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <Link href={`/listings/${l.slug}`} className="font-medium hover:text-brand-700">{l.title}</Link>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <ListingStatusBadge status={l.status} /> <span className="num">{formatMoney(l.priceCents)}</span> {l.seller.displayName}
                <VerifiedBadge status={l.seller.verificationStatus} compact /> <span>{formatDate(l.createdAt)}</span>
              </p>
            </div>
            <ModerateForm action={moderateListingAction.bind(null, l.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}
