"use server";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { catalogueChanged } from "@/lib/cache";
import { actionI18n, runAction, type ActionState, requireTraderStrict } from "@/lib/action";
import { getSellerProfile } from "@/lib/auth/dal";
import { categorySearchTerms } from "@/lib/catalog";
import { functionalScore } from "@/lib/condition";
import { gradeRank } from "@/lib/data/catalog";
import { slugify } from "@/lib/format";
import { listingSchema, parseListing, id as idSchema, type ListingInput } from "@/lib/validation";
import { updateOpenListing } from "@/lib/listings";
import { DomainError } from "@/lib/orders/service";

const UNVERIFIED_ACTIVE_LIMIT = 5;

// Category names in every language, so "kamera" and "camera" both find a listing.
function buildSearchText(d: ListingInput) {
  return [d.title, d.brand, d.model, ...categorySearchTerms(d.category), ...Object.values(d.specs).filter((v) => typeof v !== "boolean")]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 2000);
}

async function assertCanPublish(seller: { id: string; verificationStatus: string }, excludeId?: string) {
  if (seller.verificationStatus === "VERIFIED") return;
  const active = await db.listing.count({
    where: { sellerId: seller.id, status: "ACTIVE", ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (active >= UNVERIFIED_ACTIVE_LIMIT) {
    throw new DomainError("unverifiedLimit", UNVERIFIED_ACTIVE_LIMIT);
  }
}

/**
 * Whether a saved listing passes the full publishing rules. Drafts can be
 * saved unfinished, so publishing one from the listings page checks it the
 * way the form's Publish button does.
 */
async function readyToPublish(listingId: string) {
  const l = await db.listing.findUnique({
    where: { id: listingId },
    include: { conditionReport: true, images: { select: { id: true }, orderBy: { position: "asc" } } },
  });
  if (!l?.conditionReport) return false;
  const r = l.conditionReport;
  const json = (s: string, fallback: unknown) => {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  };
  return listingSchema.safeParse({
    title: l.title,
    category: l.category,
    brand: l.brand,
    model: l.model,
    description: l.description,
    priceIdr: l.priceIdr,
    originalPriceIdr: l.originalPriceIdr,
    shippingIdr: l.shippingIdr,
    location: l.location,
    conditionGrade: l.conditionGrade,
    warrantyType: l.warrantyType,
    warrantyMonths: l.warrantyMonths,
    warrantyTerms: l.warrantyTerms,
    returnWindowDays: l.returnWindowDays,
    acceptsOffers: l.acceptsOffers,
    specs: json(l.specs, {}),
    batteryHealth: r.batteryHealth,
    cosmeticScore: r.cosmeticScore,
    checks: json(r.checks, []),
    includedAccessories: json(r.includedAccessories, []),
    knownIssues: r.knownIssues,
    serialVerified: r.serialVerified,
    originalBox: r.originalBox,
    imageIds: l.images.map((i) => i.id),
    publish: true,
  }).success;
}

export type SaveListingResult = ActionState & { listingId?: string };

/** Create or update a listing including its structured condition report and photos. */
export async function saveListingAction(listingId: string | null, payload: unknown): Promise<SaveListingResult> {
  let savedId: string | undefined;
  const result = await runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    const seller = await getSellerProfile(user.id);
    if (!seller) return { error: t.actions.needSellerProfile };
    if (listingId !== null) idSchema.parse(listingId);

    const data = parseListing(payload);

    const existing = listingId
      ? await db.listing.findUnique({ where: { id: listingId }, select: { id: true, sellerId: true, status: true } })
      : null;
    if (listingId && (!existing || existing.sellerId !== seller.id)) return { error: t.actions.listingNotFound };
    if (existing && !["DRAFT", "ACTIVE"].includes(existing.status)) {
      return { error: t.actions.listingLocked };
    }
    if (data.publish && !user.emailVerified) return { error: t.domain.emailUnverified };
    if (data.publish) await assertCanPublish(seller, existing?.id);

    // Every photo must belong to this user and be unattached or already on this listing.
    const images = await db.upload.findMany({
      where: { id: { in: data.imageIds }, ownerId: user.id },
      select: { id: true, listingId: true },
    });
    if (images.length !== data.imageIds.length || images.some((i) => i.listingId && i.listingId !== listingId)) {
      return { fieldErrors: { imageIds: t.actions.invalidPhotos } };
    }

    const listingData = {
      title: data.title,
      category: data.category,
      brand: data.brand,
      model: data.model,
      description: data.description,
      priceIdr: data.priceIdr,
      originalPriceIdr: data.originalPriceIdr ?? null,
      shippingIdr: data.shippingIdr,
      conditionGrade: data.conditionGrade,
      gradeRank: gradeRank(data.conditionGrade),
      specs: JSON.stringify(data.specs),
      warrantyType: data.warrantyType,
      warrantyMonths: data.warrantyMonths,
      warrantyTerms: data.warrantyTerms,
      returnWindowDays: data.returnWindowDays,
      acceptsOffers: data.acceptsOffers,
      location: data.location,
      searchText: buildSearchText(data),
    };
    const reportData = {
      batteryHealth: data.batteryHealth ?? null,
      cosmeticScore: data.cosmeticScore,
      functionalScore: functionalScore(data.checks),
      checks: JSON.stringify(data.checks),
      includedAccessories: JSON.stringify(data.includedAccessories),
      knownIssues: data.knownIssues,
      serialVerified: data.serialVerified,
      originalBox: data.originalBox,
    };

    const listing = await db.$transaction(async (tx) => {
      const status = data.publish ? "ACTIVE" : "DRAFT";
      if (
        existing &&
        !(await updateOpenListing(tx, existing.id, {
          ...listingData,
          status,
          ...(status === "ACTIVE" && existing.status !== "ACTIVE" ? { publishedAt: new Date() } : {}),
        }))
      ) {
        return null; // A buyer reserved it since the check above.
      }
      const row = existing
        ? { id: existing.id, sellerId: existing.sellerId, status }
        : await tx.listing.create({
            data: {
              ...listingData,
              sellerId: seller.id,
              slug: `${slugify(data.title)}-${randomBytes(3).toString("hex")}`,
              status,
              publishedAt: status === "ACTIVE" ? new Date() : null,
            },
          });
      await tx.conditionReport.upsert({
        where: { listingId: row.id },
        create: { ...reportData, listingId: row.id },
        update: reportData,
      });
      // Detach removed photos, then attach in the chosen order.
      await tx.upload.updateMany({
        where: { listingId: row.id, id: { notIn: data.imageIds } },
        data: { listingId: null },
      });
      for (const [position, imageId] of data.imageIds.entries()) {
        await tx.upload.update({ where: { id: imageId }, data: { listingId: row.id, position, alt: data.title } });
      }
      return row;
    });
    if (!listing) return { error: t.actions.listingLocked };

    savedId = listing.id;
    catalogueChanged({ listings: [listing] });
    await audit(user.id, existing ? "listing.update" : "listing.create", "Listing", listing.id, { status: listing.status });
    return { ok: true, message: data.publish ? t.actions.listingPublished : t.actions.draftSaved };
  });
  return { ...result, listingId: savedId };
}

export async function setListingStatusAction(listingId: string, status: "ACTIVE" | "DRAFT" | "REMOVED"): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    const seller = await getSellerProfile(user.id);
    idSchema.parse(listingId);
    if (!["ACTIVE", "DRAFT", "REMOVED"].includes(status)) return { error: t.actions.invalidStatus };
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: { id: true, sellerId: true, status: true, conditionReport: { select: { id: true } }, _count: { select: { images: true } } },
    });
    if (!seller || !listing || listing.sellerId !== seller.id) return { error: t.actions.listingNotFound };
    if (!["DRAFT", "ACTIVE"].includes(listing.status)) return { error: t.actions.listingUnchangeable };
    if (status === "ACTIVE") {
      if (!user.emailVerified) return { error: t.domain.emailUnverified };
      if (!listing.conditionReport || listing._count.images === 0) {
        return { error: t.actions.publishNeedsPhotos };
      }
      if (!(await readyToPublish(listing.id))) return { error: t.actions.finishBeforePublish };
      await assertCanPublish(seller, listing.id);
    }
    const updated = await updateOpenListing(db, listing.id, {
      status,
      ...(status === "ACTIVE" && listing.status !== "ACTIVE" ? { publishedAt: new Date() } : {}),
    });
    if (!updated) return { error: t.actions.listingUnchangeable };
    catalogueChanged({ listings: [listing] });
    await audit(user.id, "listing.status", "Listing", listing.id, { from: listing.status, to: status });
    return { ok: true };
  });
}

export async function toggleFavoriteAction(listingId: string): Promise<ActionState & { favorited?: boolean }> {
  let favorited: boolean | undefined;
  const res = await runAction(async () => {
    const user = await requireTraderStrict();
    idSchema.parse(listingId);
    const key = { userId_listingId: { userId: user.id, listingId } };
    const existing = await db.favorite.findUnique({ where: key });
    if (existing) {
      await db.favorite.delete({ where: key });
      favorited = false;
    } else {
      const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true } });
      if (!listing) return { error: (await actionI18n()).t.actions.listingNotFound };
      await db.favorite.create({ data: { userId: user.id, listingId } });
      favorited = true;
    }
  });
  return { ...res, favorited };
}
