"use server";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalidate, listingTags, TAGS } from "@/lib/cache";
import { formToObject, runAction, type ActionState } from "@/lib/action";
import { requireUserStrict } from "@/lib/auth/dal";
import { resolveDispute } from "@/lib/orders/service";
import { disputeResolutionSchema, id as idSchema, text } from "@/lib/validation";
import { forbidden } from "next/navigation";

// Every admin action re-checks the role server-side; UI gating is not trusted.
async function requireAdminStrict() {
  const user = await requireUserStrict();
  if (user.role !== "ADMIN") forbidden();
  return user;
}

export async function reviewVerificationAction(requestId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    idSchema.parse(requestId);
    const approve = formData.get("decision") === "approve";
    const note = text(0, 500).parse(formData.get("note") ?? "");
    if (!approve && note.length < 5) return { fieldErrors: { note: "Give the seller a reason for the rejection." } };

    const request = await db.verificationRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== "PENDING") return { error: "This request has already been reviewed." };

    await db.$transaction([
      db.verificationRequest.update({
        where: { id: requestId },
        data: { status: approve ? "APPROVED" : "REJECTED", reviewNote: note || null, reviewerId: admin.id, reviewedAt: new Date() },
      }),
      db.sellerProfile.update({
        where: { id: request.sellerId },
        data: approve
          ? { verificationStatus: "VERIFIED", verifiedAt: new Date() }
          : { verificationStatus: "REJECTED" },
      }),
    ]);
    invalidate([TAGS.seller(request.sellerId), TAGS.listings, TAGS.stats]);
    await audit(admin.id, approve ? "verification.approve" : "verification.reject", "VerificationRequest", requestId, { note });
    return { ok: true, message: approve ? "Seller verified." : "Verification rejected." };
  });
}

export async function markDisputeUnderReviewAction(disputeId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    idSchema.parse(disputeId);
    const res = await db.dispute.updateMany({ where: { id: disputeId, status: "OPEN" }, data: { status: "UNDER_REVIEW" } });
    if (res.count === 0) return { error: "Dispute is not open." };
    await db.disputeMessage.create({
      data: { disputeId, authorId: admin.id, authorRole: "ADMIN", body: "A ReGear specialist is now reviewing this case." },
    });
    await audit(admin.id, "dispute.review", "Dispute", disputeId);
    return { ok: true };
  });
}

export async function resolveDisputeAction(disputeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    idSchema.parse(disputeId);
    const data = disputeResolutionSchema.parse(formToObject(formData));
    const res = await resolveDispute(disputeId, admin.id, data.resolution, data.note, data.refundCents ?? 0);
    invalidate(res.tags);
    await audit(admin.id, "dispute.resolve", "Dispute", disputeId, { resolution: data.resolution, refundCents: data.refundCents });
    return { ok: true, message: "Dispute resolved." };
  });
}

export async function moderateListingAction(listingId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    idSchema.parse(listingId);
    const reason = text(5, 500).parse(formData.get("reason") ?? "");
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, sellerId: true, status: true } });
    if (!listing) return { error: "Listing not found." };
    if (listing.status === "RESERVED" || listing.status === "SOLD") {
      return { error: "Listings with an order in progress cannot be removed; resolve via the order instead." };
    }
    await db.listing.update({ where: { id: listingId }, data: { status: "REMOVED" } });
    invalidate(listingTags(listing));
    await audit(admin.id, "listing.moderate_remove", "Listing", listingId, { reason });
    return { ok: true, message: "Listing removed." };
  });
}
