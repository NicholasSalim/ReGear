import type { Metadata } from "next";
import { getDictionary, getLocale } from "@/i18n/server";
import Image from "next/image";
import { Link } from "@/i18n/client";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/auth/dal";
import { formatDate, formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { GradeBadge, ListingStatusBadge } from "@/components/badges";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { ListingRowActions } from "./row-actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).sell.listingsMetaTitle };
}

export default async function SellerListingsPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.sell;
  const { seller } = await requireSeller("/sell/listings");
  const listings = await db.listing.findMany({
    where: { sellerId: seller.id, status: { not: "REMOVED" } },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      priceIdr: true,
      conditionGrade: true,
      viewCount: true,
      updatedAt: true,
      images: { select: { key: true }, orderBy: { position: "asc" }, take: 1 },
      _count: { select: { favorites: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title={t.listingsTitle}
        actions={
          <ButtonLink href="/sell/listings/new">
            <Plus className="size-4" aria-hidden /> {t.newListing}
          </ButtonLink>
        }
      />
      {listings.length === 0 ? (
        <EmptyState title={t.noListings} description={t.noListingsHint} action={<ButtonLink href="/sell/listings/new">{t.createListing}</ButtonLink>} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {listings.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {l.images[0] && <Image src={mediaUrl(l.images[0].key)} alt="" fill sizes="64px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1 basis-48">
                <Link href={l.status === "DRAFT" ? `/sell/listings/${l.id}/edit` : `/listings/${l.slug}`} className="block truncate font-semibold hover:text-brand-700">
                  {l.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <ListingStatusBadge status={l.status} />
                  <GradeBadge grade={l.conditionGrade} />
                  <span>{formatMoney(l.priceIdr)}</span>
                  <span>· {t.saves(l._count.favorites)}</span>
                  <span>· {t.updated(formatDate(l.updatedAt, locale))}</span>
                </div>
              </div>
              <ListingRowActions id={l.id} status={l.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
