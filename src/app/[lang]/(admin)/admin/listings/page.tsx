import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { dayRange, readSearch } from "@/lib/admin/search";
import { escapeLike } from "@/lib/search-text";
import { LISTING_STATUSES, LISTING_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { moderateListingAction } from "@/actions/admin";
import { ListingStatusBadge, VerifiedBadge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/ui";
import { ModerateForm } from "../admin-forms";
import { Pager, SearchBar } from "../search-controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.listingsMetaTitle };
}

export default async function AdminListingsPage({ searchParams }: PageProps<"/[lang]/admin/listings">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin;
  await requireAdmin();
  const search = readSearch(await searchParams, LISTING_STATUSES);
  const query = escapeLike(search.q.toLowerCase());
  const where: Prisma.ListingWhereInput = {
    ...(search.status ? { status: search.status } : {}),
    ...(dayRange(search) ? { createdAt: dayRange(search) } : {}),
    // searchText holds the title, brand, model and specs in lower case.
    ...(query ? { OR: [{ id: search.q }, { searchText: { contains: query } }] } : {}),
  };
  const [listings, total] = await Promise.all([
    db.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: search.skip,
      take: search.take,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        priceIdr: true,
        createdAt: true,
        seller: { select: { displayName: true, userId: true, verificationStatus: true } },
      },
    }),
    db.listing.count({ where }),
  ]);

  return (
    <>
      <PageHeader title={t.listingsTitle} description={t.listingsIntro} />
      <SearchBar
        search={search}
        path="/admin/listings"
        placeholder={t.searchListings}
        statuses={LISTING_STATUSES.map((s) => ({ value: s, label: pick(LISTING_STATUS_LABELS[s], locale) }))}
      />
      {listings.length === 0 ? (
        <EmptyState title={t.searchBar.none} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {listings.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1 basis-48">
                <Link href={`/listings/${l.slug}`} className="font-medium hover:text-brand-700">{l.title}</Link>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <ListingStatusBadge status={l.status} /> <span className="num">{formatMoney(l.priceIdr)}</span>
                  <Link href={`/admin/users/${l.seller.userId}`} className="hover:text-brand-700">{l.seller.displayName || dict.common.deletedShop}</Link>
                  <VerifiedBadge status={l.seller.verificationStatus} compact /> <span>{formatDate(l.createdAt, locale)}</span>
                </p>
              </div>
              {/* Only listings without an order can be taken down; the others are settled through the order. */}
              {(l.status === "ACTIVE" || l.status === "DRAFT") && <ModerateForm action={moderateListingAction.bind(null, l.id)} />}
            </li>
          ))}
        </ul>
      )}
      <Pager search={search} total={total} path="/admin/listings" />
    </>
  );
}
