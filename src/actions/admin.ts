"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { catalogueChanged } from "@/lib/cache";
import { actionI18n, formToObject, runAction, type ActionState } from "@/lib/action";
import { requireUserStrict } from "@/lib/auth/dal";
import { resolveDispute } from "@/lib/orders/service";
import { markRefundSent } from "@/lib/orders/refunds";
import { enqueueEmail } from "@/lib/email/outbox";
import { markDisputeUnderReview } from "@/lib/orders/disputes";
import { isLocale } from "@/i18n/locales";
import { banSchema, disputeResolutionSchema, id as idSchema, text } from "@/lib/validation";
import { forbidden } from "next/navigation";
import { banEnd, banUser, unbanUser } from "@/lib/account/ban";

// Every admin action re-checks the role server-side; UI gating is not trusted.
async function requireAdminStrict() {
  const user = await requireUserStrict();
  if (user.role !== "ADMIN") forbidden();
  return user;
}

export async function reviewVerificationAction(requestId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    const { t } = await actionI18n();
    idSchema.parse(requestId);
    const approve = formData.get("decision") === "approve";
    const note = text(0, 500).parse(formData.get("note") ?? "");
    if (!approve && note.length < 5) return { fieldErrors: { note: t.actions.rejectionReason } };

    const request = await db.verificationRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== "PENDING") return { error: t.actions.verificationReviewed };

    await db.$transaction(async (tx) => {
      await tx.verificationRequest.update({
        where: { id: requestId },
        data: { status: approve ? "APPROVED" : "REJECTED", reviewNote: note || null, reviewerId: admin.id, reviewedAt: new Date() },
      });
      const seller = await tx.sellerProfile.update({
        where: { id: request.sellerId },
        data: approve ? { verificationStatus: "VERIFIED", verifiedAt: new Date() } : { verificationStatus: "REJECTED" },
        select: { user: { select: { id: true, locale: true } } },
      });
      await enqueueEmail(
        tx,
        { userId: seller.user.id, locale: isLocale(seller.user.locale) ? seller.user.locale : "id" },
        approve ? { template: "verification-approved", params: {} } : { template: "verification-rejected", params: { note } },
      );
    });
    catalogueChanged({ sellers: [request.sellerId] });
    await audit(admin.id, approve ? "verification.approve" : "verification.reject", "VerificationRequest", requestId, { note });
    return { ok: true, message: approve ? t.actions.sellerVerified : t.actions.verificationRejected };
  });
}

export async function markDisputeUnderReviewAction(disputeId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    idSchema.parse(disputeId);
    if (!(await markDisputeUnderReview(disputeId, admin.id))) return { error: (await actionI18n()).t.actions.disputeNotOpen };
    refresh();
    return { ok: true };
  });
}

export async function resolveDisputeAction(disputeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    idSchema.parse(disputeId);
    const data = disputeResolutionSchema.parse(formToObject(formData));
    await resolveDispute(disputeId, admin.id, data.resolution, data.note, data.refundIdr ?? 0);
    return { ok: true, message: (await actionI18n()).t.actions.disputeResolved };
  });
}

/** The admin transferred a bank-transfer refund; the note is the transfer reference. */
export async function markRefundSentAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    const { t } = await actionI18n();
    idSchema.parse(orderId);
    const note = text(0, 500).parse(formData.get("note") ?? "");
    if (note.length < 5) return { fieldErrors: { note: t.actions.noteRequired } };
    await markRefundSent(orderId, admin.id, note);
    refresh();
    return { ok: true, message: t.actions.refundMarkedSent };
  });
}

export async function moderateListingAction(listingId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    const { t } = await actionI18n();
    idSchema.parse(listingId);
    const reason = text(5, 500).parse(formData.get("reason") ?? "");
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, sellerId: true, status: true } });
    if (!listing) return { error: t.actions.listingNotFound };
    // Conditional, so an order placed since the read above keeps its listing.
    const removed = await db.listing.updateMany({ where: { id: listingId, status: { notIn: ["RESERVED", "SOLD"] } }, data: { status: "REMOVED" } });
    if (removed.count !== 1) return { error: t.actions.moderationLocked };
    catalogueChanged({ listings: [listing] });
    await audit(admin.id, "listing.moderate_remove", "Listing", listingId, { reason });
    return { ok: true, message: t.actions.listingRemoved };
  });
}

/** Ban an account for a chosen time or permanently, or change how long its ban lasts. */
export async function banUserAction(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    const { t } = await actionI18n();
    idSchema.parse(userId);
    if (userId === admin.id) return { error: t.domain.banAdmin };
    const { length, reason, until: untilDate } = banSchema.parse(formToObject(formData));
    let until: Date | null;
    try {
      until = banEnd(length, untilDate);
    } catch {
      return { fieldErrors: { until: t.domain.banEndInPast } };
    }
    if (until && until <= new Date()) return { fieldErrors: { until: t.domain.banEndInPast } };
    const { cancelled } = await banUser(admin.id, userId, { until, reason });
    refresh();
    return { ok: true, message: t.actions.userBanned(cancelled) };
  });
}

export async function unbanUserAction(userId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    const { t } = await actionI18n();
    idSchema.parse(userId);
    await unbanUser(admin.id, userId);
    refresh();
    return { ok: true, message: t.actions.userUnbanned };
  });
}
