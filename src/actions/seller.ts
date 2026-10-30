"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalidate, TAGS } from "@/lib/cache";
import { actionI18n, formToObject, runAction, type ActionState } from "@/lib/action";
import { localePath } from "@/i18n/locales";
import { getSellerProfile, requireUserStrict } from "@/lib/auth/dal";
import { slugify } from "@/lib/format";
import { rateLimit } from "@/lib/security/rate-limit";
import { shopNameKey, shopNameTaken } from "@/lib/shop-name";
import { InvalidImageError, MAX_UPLOAD_BYTES, savePrivateDocument } from "@/lib/storage";
import { sellerProfileSchema, verificationSchema } from "@/lib/validation";

async function uniqueSellerSlug(name: string) {
  const base = slugify(name) || "seller";
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    const taken = await db.sellerProfile.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${base}-${randomBytes(6).toString("hex")}`;
}

export async function createSellerProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const user = await requireUserStrict();
    if (await getSellerProfile(user.id)) return { ok: true };
    const { t } = await actionI18n();
    const data = sellerProfileSchema.parse(formToObject(formData));
    const slug = await uniqueSellerSlug(data.displayName);
    const seller = await db.$transaction(async (tx) => {
      if (await shopNameTaken(tx, data.displayName)) return null;
      return tx.sellerProfile.create({ data: { ...data, userId: user.id, slug } });
    });
    if (!seller) return { fieldErrors: { displayName: t.actions.shopNameTaken } };
    await audit(user.id, "seller.create", "SellerProfile", seller.id);
  });
  if (result.ok) redirect(localePath("/sell", (await actionI18n()).locale));
  return result;
}

export async function updateSellerProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    const seller = await getSellerProfile(user.id);
    if (!seller) return { error: t.actions.needSellerProfile };
    const data = sellerProfileSchema.parse(formToObject(formData));
    const saved = await db.$transaction(async (tx) => {
      // Unchanged names skip the check, so other fields can always be saved.
      if (shopNameKey(data.displayName) !== shopNameKey(seller.displayName) && (await shopNameTaken(tx, data.displayName, seller.id))) return false;
      await tx.sellerProfile.update({ where: { id: seller.id }, data });
      return true;
    });
    if (!saved) return { fieldErrors: { displayName: t.actions.shopNameTaken } };
    invalidate([TAGS.seller(seller.id), TAGS.listings]);
    return { ok: true, message: t.actions.shopSaved };
  });
}

export async function submitVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    const seller = await getSellerProfile(user.id);
    if (!seller) return { error: t.actions.needSellerProfile };
    if (seller.verificationStatus === "VERIFIED") return { error: t.actions.alreadyVerified };
    if (seller.verificationStatus === "PENDING") return { error: t.actions.verificationPending };

    const limited = await rateLimit(`verify:${user.id}`, 5, 86_400);
    if (!limited.ok) return { error: t.actions.verificationLimit };

    const data = verificationSchema.parse(formToObject(formData));
    const file = formData.get("document");
    if (!(file instanceof File) || file.size === 0) return { fieldErrors: { document: t.actions.documentRequired } };
    if (file.size > MAX_UPLOAD_BYTES) return { fieldErrors: { document: t.actions.documentTooLarge } };

    let documentKey: string;
    try {
      ({ key: documentKey } = await savePrivateDocument(Buffer.from(await file.arrayBuffer())));
    } catch (err) {
      if (err instanceof InvalidImageError) return { fieldErrors: { document: t.uploads.image[err.code] } };
      throw err;
    }

    await db.$transaction([
      db.verificationRequest.create({
        data: {
          sellerId: seller.id,
          legalName: data.legalName,
          phone: data.phone,
          address: data.address,
          idType: data.idType,
          // Store only the last 4 characters of the document number (data minimisation).
          idNumberLast4: data.idNumber.slice(-4),
          documentKey,
        },
      }),
      db.sellerProfile.update({ where: { id: seller.id }, data: { verificationStatus: "PENDING" } }),
    ]);
    await audit(user.id, "seller.verification_submitted", "SellerProfile", seller.id);
    // The page swaps the form for the "under review" notice.
    refresh();
    return { ok: true, message: t.actions.verificationSubmitted };
  });
}
