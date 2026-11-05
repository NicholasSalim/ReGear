"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { catalogueChanged } from "@/lib/cache";
import { actionI18n, formToObject, runAction, type ActionState, requireTraderStrict } from "@/lib/action";
import { localePath } from "@/i18n/locales";
import { getSellerProfile } from "@/lib/auth/dal";
import { slugify } from "@/lib/format";
import { rateLimit } from "@/lib/security/rate-limit";
import { shopNameKey, shopNameTaken } from "@/lib/shop-name";
import { InvalidImageError, MAX_UPLOAD_BYTES, savePrivateDocument } from "@/lib/storage";
import { fieldErrors, sellerProfileSchema, verificationSchema } from "@/lib/validation";

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
    const user = await requireTraderStrict();
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
    const user = await requireTraderStrict();
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
    catalogueChanged({ sellers: [seller.id] });
    return { ok: true, message: t.actions.shopSaved };
  });
}

export async function submitVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { locale, t } = await actionI18n();
    const seller = await getSellerProfile(user.id);
    if (!seller) return { error: t.actions.needSellerProfile };
    if (seller.verificationStatus === "VERIFIED") return { error: t.actions.alreadyVerified };
    if (seller.verificationStatus === "PENDING") return { error: t.actions.verificationPending };

    // Check the photo together with the other fields, so every problem shows at once.
    const parsed = verificationSchema.safeParse(formToObject(formData));
    const file = formData.get("document");
    const documentError =
      !(file instanceof File) || file.size === 0 ? t.actions.documentRequired : file.size > MAX_UPLOAD_BYTES ? t.actions.documentTooLarge : null;
    if (!parsed.success || documentError || !(file instanceof File)) {
      return {
        error: t.validation.fixFields,
        fieldErrors: { ...(parsed.success ? {} : fieldErrors(parsed.error, t, locale)), ...(documentError ? { document: documentError } : {}) },
      };
    }
    const data = parsed.data;

    // Counted after the form checks out, so typos don't use up the day's attempts.
    const limited = await rateLimit(`verify:${user.id}`, 5, 86_400);
    if (!limited.ok) return { error: t.actions.verificationLimit };

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
