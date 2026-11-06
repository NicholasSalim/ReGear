import "server-only";
import { en } from "@/i18n/dictionaries/en";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { enqueueDisputeMessageEmails } from "@/lib/email/notify";

// The dispute conversation. Opening a dispute and resolving it change the
// order (its status, a refund, the seller's credit), so those stay with the
// order service; everything said in between lives here: who may write, when
// the conversation is closed, and who hears about each message.

export type DisputeRole = "BUYER" | "SELLER" | "ADMIN";

/** How someone takes part in a dispute: as its buyer, its seller, or an admin; null if it isn't theirs. */
export function disputeRole(
  dispute: { order: { buyerId: string; seller: { userId: string } } },
  user: { id: string; role: string },
): DisputeRole | null {
  if (user.role === "ADMIN") return "ADMIN";
  if (dispute.order.buyerId === user.id) return "BUYER";
  if (dispute.order.seller.userId === user.id) return "SELLER";
  return null;
}

export type PostResult = { ok: true } | { ok: false; reason: "notFound" | "closed" };

/**
 * Add a message to a dispute and email the other people in it. Someone who
 * isn't part of the dispute is told it doesn't exist; nobody can write once
 * it's resolved.
 */
export async function postDisputeMessage(disputeId: string, user: { id: string; role: string }, body: string): Promise<PostResult> {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { status: true, order: { select: { buyerId: true, seller: { select: { userId: true } } } } },
  });
  const role = dispute ? disputeRole(dispute, user) : null;
  if (!dispute || !role) return { ok: false, reason: "notFound" };
  if (dispute.status === "RESOLVED") return { ok: false, reason: "closed" };

  await db.$transaction(async (tx) => {
    await tx.disputeMessage.create({ data: { disputeId, authorId: user.id, authorRole: role, body } });
    await tx.dispute.update({ where: { id: disputeId }, data: { updatedAt: new Date() } });
    await enqueueDisputeMessageEmails(tx, disputeId, role);
  });
  return { ok: true };
}

/** An admin takes up an open dispute: both sides are told ReGear is reviewing it. False if it wasn't open (already taken up, or resolved). */
export async function markDisputeUnderReview(disputeId: string, adminId: string): Promise<boolean> {
  const updated = await db.$transaction(async (tx) => {
    // Conditional, so two admins taking it up at once post one message.
    const res = await tx.dispute.updateMany({ where: { id: disputeId, status: "OPEN" }, data: { status: "UNDER_REVIEW" } });
    if (res.count === 0) return false;
    await tx.disputeMessage.create({ data: { disputeId, authorId: adminId, authorRole: "ADMIN", body: en.disputes.system.reviewing } });
    await enqueueDisputeMessageEmails(tx, disputeId, "ADMIN");
    return true;
  });
  if (updated) await audit(adminId, "dispute.review", "Dispute", disputeId);
  return updated;
}
