"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalidate } from "@/lib/cache";
import { formToObject, runAction, type ActionState } from "@/lib/action";
import { requireUserStrict } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/security/rate-limit";
import * as orders from "@/lib/orders/service";
import {
  addressSchema,
  disputeMessageSchema,
  disputeSchema,
  id as idSchema,
  returnRequestSchema,
  reviewSchema,
  shipSchema,
  text,
} from "@/lib/validation";

export async function checkoutAction(listingId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let orderId: string | undefined;
  const result = await runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(listingId);
    const limited = await rateLimit(`checkout:${user.id}`, 20, 3600);
    if (!limited.ok) return { error: "Too many checkout attempts. Please try again later." };
    const address = addressSchema.parse(formToObject(formData));
    const res = await orders.createOrder(user.id, listingId, address);
    invalidate(res.tags);
    orderId = res.orderId;
  });
  if (orderId) redirect(`/account/orders/${orderId}?pay=1`);
  return result;
}

/** Generic wrapper for simple order transitions identified by orderId. */
async function orderStep(orderId: string, fn: (userId: string) => Promise<{ tags: string[] }>, message: string) {
  return runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(orderId);
    const res = await fn(user.id);
    invalidate(res.tags);
    return { ok: true, message };
  });
}

export async function payOrderAction(orderId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return orderStep(orderId, (uid) => orders.payOrder(orderId, uid), "Payment successful. Funds are held in escrow until you confirm the item.");
}

export async function cancelOrderAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const reason = text(0, 300).catch("").parse(formData.get("reason") ?? "");
  return orderStep(orderId, (uid) => orders.cancelOrder(orderId, uid, reason), "Order cancelled.");
}

export async function shipOrderAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(orderId);
    const { carrier, trackingNumber } = shipSchema.parse(formToObject(formData));
    const res = await orders.shipOrder(orderId, user.id, carrier, trackingNumber);
    invalidate(res.tags);
    return { ok: true, message: "Marked as shipped. The buyer has been notified." };
  });
}

export async function confirmDeliveryAction(orderId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return orderStep(orderId, (uid) => orders.confirmDelivery(orderId, uid), "Delivery confirmed. Inspect your item against the condition report.");
}

export async function acceptOrderAction(orderId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return orderStep(orderId, (uid) => orders.acceptOrder(orderId, uid), "Thanks! The seller has been paid.");
}

export async function requestReturnAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(orderId);
    const { reason, details } = returnRequestSchema.parse(formToObject(formData));
    const res = await orders.requestReturn(orderId, user.id, reason, details);
    invalidate(res.tags);
    return { ok: true, message: "Return requested. The seller has 3 days to respond." };
  });
}

export async function respondReturnAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(orderId);
    const approve = formData.get("decision") === "approve";
    const note = text(0, 1000).parse(formData.get("note") ?? "");
    const res = await orders.respondToReturn(orderId, user.id, approve, note);
    invalidate(res.tags);
    return { ok: true, message: approve ? "Return approved." : "Return rejected." };
  });
}

export async function shipReturnAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(orderId);
    const { carrier, trackingNumber } = shipSchema.parse(formToObject(formData));
    const res = await orders.shipReturn(orderId, user.id, carrier, trackingNumber);
    invalidate(res.tags);
    return { ok: true, message: "Return shipment recorded." };
  });
}

export async function receiveReturnAction(orderId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return orderStep(orderId, (uid) => orders.receiveReturn(orderId, uid), "Return received and buyer refunded.");
}

export async function openDisputeAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let disputeId: string | undefined;
  const result = await runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(orderId);
    const { reason, description } = disputeSchema.parse(formToObject(formData));
    const res = await orders.openDispute(orderId, user.id, reason, description);
    invalidate(res.tags);
    disputeId = res.disputeId;
    await audit(user.id, "dispute.open", "Dispute", res.disputeId, { orderId, reason });
  });
  if (disputeId) redirect(`/disputes/${disputeId}`);
  return result;
}

export async function postDisputeMessageAction(disputeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(disputeId);
    const limited = await rateLimit(`dispute-msg:${user.id}`, 30, 3600);
    if (!limited.ok) return { error: "You are sending messages too quickly." };
    const { body } = disputeMessageSchema.parse(formToObject(formData));

    const dispute = await db.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, order: { select: { buyerId: true, seller: { select: { userId: true } } } } },
    });
    if (!dispute) return { error: "Dispute not found." };
    const role =
      user.role === "ADMIN"
        ? "ADMIN"
        : dispute.order.buyerId === user.id
          ? "BUYER"
          : dispute.order.seller.userId === user.id
            ? "SELLER"
            : null;
    if (!role) return { error: "Dispute not found." };
    if (dispute.status === "RESOLVED") return { error: "This dispute is closed." };

    await db.disputeMessage.create({ data: { disputeId, authorId: user.id, authorRole: role, body } });
    await db.dispute.update({ where: { id: disputeId }, data: { updatedAt: new Date() } });
    return { ok: true };
  });
}

export async function leaveReviewAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    idSchema.parse(orderId);
    const { rating, comment } = reviewSchema.parse(formToObject(formData));
    const res = await orders.leaveReview(orderId, user.id, rating, comment);
    invalidate(res.tags);
    return { ok: true, message: "Thanks for your review!" };
  });
}
