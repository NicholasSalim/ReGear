import "server-only";
import { searchWords } from "@/lib/search-text";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { TAGS } from "@/lib/cache";
import { PAGE_SIZE, type ConditionGrade } from "@/lib/constants";
import type { BrowseParams } from "@/lib/validation";
import type { Prisma } from "@/generated/prisma/client";
import type { ConditionCheckEntry } from "@/lib/condition";

// Public catalogue reads. Everything here is cached with `use cache` and
// tagged so mutations can invalidate precisely. Only public fields are
// selected; nothing user-private ever enters these shared cache entries.

const PUBLIC_STATUSES = ["ACTIVE", "RESERVED", "SOLD"];

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  category: true,
  brand: true,
  priceIdr: true,
  originalPriceIdr: true,
  conditionGrade: true,
  warrantyType: true,
  warrantyMonths: true,
  location: true,
  status: true,
  images: { select: { key: true, width: true, height: true, alt: true }, orderBy: { position: "asc" }, take: 1 },
  conditionReport: { select: { batteryHealth: true, functionalScore: true, checks: true } },
  seller: { select: { displayName: true, slug: true, verificationStatus: true } },
} satisfies Prisma.ListingSelect;

export type ListingCard = Prisma.ListingGetPayload<{ select: typeof cardSelect }>;

function browseWhere(p: BrowseParams): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = { status: "ACTIVE" };
  if (p.category) where.category = p.category;
  if (p.grade.length) where.conditionGrade = { in: p.grade };
  if (p.brand) where.brand = p.brand;
  if (p.min !== undefined || p.max !== undefined) {
    where.priceIdr = {
      ...(p.min !== undefined ? { gte: p.min } : {}),
      ...(p.max !== undefined ? { lte: p.max } : {}),
    };
  }
  if (p.verified) where.seller = { verificationStatus: "VERIFIED" };
  if (p.warranty) where.warrantyType = { not: "NONE" };
  if (p.q) {
    const words = searchWords(p.q);
    if (words.length) where.AND = words.map((w) => ({ searchText: { contains: w } }));
  }
  return where;
}

function browseOrder(sort: BrowseParams["sort"]): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ priceIdr: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ priceIdr: "desc" }, { id: "asc" }];
    case "best_condition":
      return [{ gradeRank: "asc" }, { publishedAt: "desc" }];
    default:
      return [{ publishedAt: "desc" }, { id: "desc" }];
  }
}

export async function searchListings(params: BrowseParams) {
  "use cache";
  cacheLife("minutes");
  cacheTag(TAGS.listings);

  const where = browseWhere(params);
  const [items, total] = await Promise.all([
    db.listing.findMany({
      where,
      select: cardSelect,
      orderBy: browseOrder(params.sort),
      skip: (params.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.listing.count({ where }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getBrands(category?: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.listings);
  const rows = await db.listing.groupBy({
    by: ["brand"],
    where: { status: "ACTIVE", ...(category ? { category } : {}) },
    _count: { _all: true },
    orderBy: { brand: "asc" },
  });
  return rows.map((r) => ({ brand: r.brand, count: r._count._all }));
}

export async function getLatestListings(limit = 8) {
  "use cache";
  cacheLife("minutes");
  cacheTag(TAGS.listings);
  return db.listing.findMany({
    where: { status: "ACTIVE" },
    select: cardSelect,
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
}

export async function getCategoryCounts() {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.listings);
  const rows = await db.listing.groupBy({ by: ["category"], where: { status: "ACTIVE" }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.category, r._count._all])) as Record<string, number>;
}

export async function getMarketplaceStats() {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.stats);
  const [listings, verifiedSellers, completedOrders] = await Promise.all([
    db.listing.count({ where: { status: "ACTIVE" } }),
    db.sellerProfile.count({ where: { verificationStatus: "VERIFIED" } }),
    db.order.count({ where: { status: "COMPLETED" } }),
  ]);
  return { listings, verifiedSellers, completedOrders };
}

const detailSelect = {
  id: true,
  slug: true,
  sellerId: true,
  title: true,
  category: true,
  brand: true,
  model: true,
  description: true,
  priceIdr: true,
  originalPriceIdr: true,
  shippingIdr: true,
  conditionGrade: true,
  specs: true,
  warrantyType: true,
  warrantyMonths: true,
  warrantyTerms: true,
  returnWindowDays: true,
  location: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  images: { select: { id: true, key: true, width: true, height: true, alt: true }, orderBy: { position: "asc" } },
  conditionReport: true,
  seller: {
    select: {
      id: true,
      slug: true,
      displayName: true,
      location: true,
      verificationStatus: true,
      verifiedAt: true,
      ratingAvg: true,
      ratingCount: true,
      salesCount: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ListingSelect;

export type ListingDetail = Omit<Prisma.ListingGetPayload<{ select: typeof detailSelect }>, "specs" | "conditionReport"> & {
  specs: Record<string, string | number | boolean>;
  conditionReport:
    | (Omit<NonNullable<Prisma.ListingGetPayload<{ select: typeof detailSelect }>["conditionReport"]>, "checks" | "includedAccessories"> & {
        checks: ConditionCheckEntry[];
        includedAccessories: string[];
      })
    | null;
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function hydrateDetail(row: Prisma.ListingGetPayload<{ select: typeof detailSelect }>): ListingDetail {
  return {
    ...row,
    specs: parseJson(row.specs, {}),
    conditionReport: row.conditionReport
      ? {
          ...row.conditionReport,
          checks: parseJson<ConditionCheckEntry[]>(row.conditionReport.checks, []),
          includedAccessories: parseJson<string[]>(row.conditionReport.includedAccessories, []),
        }
      : null,
  };
}

/** Public listing page data (null for drafts / removed listings). */
export async function getPublicListing(slug: string): Promise<ListingDetail | null> {
  "use cache";
  cacheLife("hours");
  const row = await db.listing.findUnique({ where: { slug }, select: detailSelect });
  if (!row || !PUBLIC_STATUSES.includes(row.status)) {
    cacheTag(TAGS.listings);
    return null;
  }
  cacheTag(TAGS.listing(row.id), TAGS.seller(row.sellerId));
  return hydrateDetail(row);
}

export async function getSimilarListings(listingId: string, category: string, limit = 4) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.listings);
  return db.listing.findMany({
    where: { status: "ACTIVE", category, id: { not: listingId } },
    select: cardSelect,
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
}

export async function getCompareListings(ids: string[]): Promise<ListingDetail[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(TAGS.listings);
  const rows = await db.listing.findMany({
    where: { id: { in: ids }, status: { in: PUBLIC_STATUSES } },
    select: detailSelect,
  });
  // Preserve the order the user chose.
  return ids.flatMap((id) => {
    const row = rows.find((r) => r.id === id);
    return row ? [hydrateDetail(row)] : [];
  });
}

export async function getPublicSeller(slug: string) {
  "use cache";
  cacheLife("hours");
  const seller = await db.sellerProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      displayName: true,
      bio: true,
      location: true,
      verificationStatus: true,
      verifiedAt: true,
      ratingAvg: true,
      ratingCount: true,
      salesCount: true,
      createdAt: true,
      user: { select: { deletedAt: true } },
    },
  });
  if (!seller || seller.user.deletedAt) {
    cacheTag(TAGS.listings);
    return null;
  }
  cacheTag(TAGS.seller(seller.id));
  const [listings, reviews] = await Promise.all([
    db.listing.findMany({
      where: { sellerId: seller.id, status: "ACTIVE" },
      select: cardSelect,
      orderBy: { publishedAt: "desc" },
      take: 48,
    }),
    db.review.findMany({
      where: { sellerId: seller.id },
      select: { id: true, rating: true, comment: true, createdAt: true, buyer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return {
    seller: { ...seller, user: undefined },
    listings,
    // Only expose the buyer's first name publicly.
    reviews: reviews.map((r) => ({ ...r, buyer: { name: r.buyer.name.split(" ")[0] } })),
  };
}

export async function getSitemapEntries() {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.listings);
  const [listings, sellers] = await Promise.all([
    db.listing.findMany({
      where: { status: { in: ["ACTIVE", "RESERVED"] } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 45_000,
    }),
    db.sellerProfile.findMany({
      where: { listings: { some: { status: "ACTIVE" } } },
      select: { slug: true, updatedAt: true },
    }),
  ]);
  return { listings, sellers };
}

export function gradeRank(grade: ConditionGrade): number {
  return ["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR", "FOR_PARTS"].indexOf(grade);
}

/**
 * The home page hero shows one real condition report. Prefer a recent listing
 * that discloses a minor issue: it demonstrates what the report is for.
 */
export async function getFeaturedReport(): Promise<ListingDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.listings);
  const rows = await db.listing.findMany({
    where: { status: "ACTIVE", conditionReport: { isNot: null }, images: { some: {} } },
    select: detailSelect,
    orderBy: { publishedAt: "desc" },
    take: 12,
  });
  const hydrated = rows.map(hydrateDetail);
  return (
    hydrated.find((l) => l.conditionReport?.checks.some((c) => c.status === "MINOR") && l.conditionReport.batteryHealth != null) ??
    hydrated[0] ??
    null
  );
}
