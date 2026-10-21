"use server";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalidate, listingTags } from "@/lib/cache";
import { runAction, type ActionState } from "@/lib/action";
import { getSellerProfile, requireUserStrict } from "@/lib/auth/dal";
import { getCategory } from "@/lib/catalog";
import { functionalScore } from "@/lib/condition";
import { gradeRank } from "@/lib/data/catalog";
import { slugify } from "@/lib/format";
import { listingSchema, id as idSchema, type ListingInput } from "@/lib/validation";
import { DomainError } from "@/lib/orders/service";

const UNVERIFIED_ACTIVE_LIMIT = 5;

function buildSearchText(d: ListingInput) {
  const category = getCategory(d.category);
  return [d.title, d.brand, d.model, category?.name, ...Object.values(d.specs).filter((v) => typeof v !== "boolean")]
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
    throw new DomainError(
      `Unverified sellers can have up to ${UNVERIFIED_ACTIVE_LIMIT} active listings. Verify your account to list more.`,
    );
  }
}

export type SaveListingResult = ActionState & { listingId?: string };

/** Create or update a listing including its structured condition report and photos. */
export async function saveListingAction(listingId: string | null, payload: unknown): Promise<SaveListingResult> {
  let savedId: string | undefined;
  const result = await runAction(async () => {
    const user = await requireUserStrict();
    const seller = await getSellerProfile(user.id);
    if (!seller) return { error: "Create a seller profile first." };
    if (listingId !== null) idSchema.parse(listingId);

    const data = listingSchema.parse(payload);

    const existing = listingId
      ? await db.listing.findUnique({ where: { id: listingId }, select: { id: true, sellerId: true, status: true } })
      : null;
    if (listingId && (!existing || existing.sellerId !== seller.id)) return { error: "Listing not found." };
    if (existing && !["DRAFT", "ACTIVE"].includes(existing.status)) {
      return { error: "Listings that are reserved, sold or removed can no longer be edited." };
    }
    if (data.publish) await assertCanPublish(seller, existing?.id);

    // Every photo must belong to this user and be unattached or already on this listing.
    const images = await db.upload.findMany({
      where: { id: { in: data.imageIds }, ownerId: user.id },
      select: { id: true, listingId: true },
    });
    if (images.length !== data.imageIds.length || images.some((i) => i.listingId && i.listingId !== listingId)) {
      return { fieldErrors: { imageIds: "One or more photos are invalid. Please re-upload them." } };
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
      const row = existing
        ? await tx.listing.update({
            where: { id: existing.id },
            data: {
              ...listingData,
              status,
              ...(status === "ACTIVE" && existing.status !== "ACTIVE" ? { publishedAt: new Date() } : {}),
            },
          })
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

    savedId = listing.id;
    invalidate(listingTags(listing));
    await audit(user.id, existing ? "listing.update" : "listing.create", "Listing", listing.id, { status: listing.status });
    return { ok: true, message: data.publish ? "Listing published." : "Draft saved." };
  });
  return { ...result, listingId: savedId };
}

export async function setListingStatusAction(listingId: string, status: "ACTIVE" | "DRAFT" | "REMOVED"): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const seller = await getSellerProfile(user.id);
    idSchema.parse(listingId);
    if (!["ACTIVE", "DRAFT", "REMOVED"].includes(status)) return { error: "Invalid status." };
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: { id: true, sellerId: true, status: true, conditionReport: { select: { id: true } }, _count: { select: { images: true } } },
    });
    if (!seller || !listing || listing.sellerId !== seller.id) return { error: "Listing not found." };
    if (!["DRAFT", "ACTIVE"].includes(listing.status)) return { error: "This listing can no longer be changed." };
    if (status === "ACTIVE") {
      if (!listing.conditionReport || listing._count.images === 0) {
        return { error: "Add photos and a condition report before publishing." };
      }
      await assertCanPublish(seller, listing.id);
    }
    await db.listing.update({
      where: { id: listing.id },
      data: { status, ...(status === "ACTIVE" && listing.status !== "ACTIVE" ? { publishedAt: new Date() } : {}) },
    });
    invalidate(listingTags(listing));
    await audit(user.id, "listing.status", "Listing", listing.id, { from: listing.status, to: status });
    return { ok: true };
  });
}

export async function toggleFavoriteAction(listingId: string): Promise<ActionState & { favorited?: boolean }> {
  let favorited: boolean | undefined;
  const res = await runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(listingId);
    const key = { userId_listingId: { userId: user.id, listingId } };
    const existing = await db.favorite.findUnique({ where: key });
    if (existing) {
      await db.favorite.delete({ where: key });
      favorited = false;
    } else {
      const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true } });
      if (!listing) return { error: "Listing not found." };
      await db.favorite.create({ data: { userId: user.id, listingId } });
      favorited = true;
    }
    invalidate([`favorites-${user.id}`]);
  });
  return { ...res, favorited };
}
