"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { localePath } from "@/i18n/locales";
import type { Dictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalidate } from "@/lib/cache";
import { actionI18n, formToObject, runAction, type ActionState, requireTraderStrict } from "@/lib/action";
import { requireUserStrict } from "@/lib/auth/dal";
import { getAddress, shippingSnapshot } from "@/lib/addresses";
import { rateLimit } from "@/lib/security/rate-limit";
import * as orders from "@/lib/orders/service";
import { enqueueDisputeMessageEmails } from "@/lib/email/notify";
import {
  disputeMessageSchema,
  disputeSchema,
  id as idSchema,
  payoutAccountSchema,
  returnRequestSchema,
  reviewSchema,
  shipSchema,
  text,
} from "@/lib/validation";

type Messages = Dictionary["actions"];
/** Keys of the plain-text action messages (some messages take values). */
type ActionMessage = { [K in keyof Messages]: Messages[K] extends string ? K : never }[keyof Messages];

export async function checkoutAction(listingId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let orderId: string | undefined;
  const result = await runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    if (!user.emailVerified) return { error: t.domain.emailUnverified };
    idSchema.parse(listingId);
    const limited = await rateLimit(`checkout:${user.id}`, 20, 3600);
    if (!limited.ok) return { error: t.actions.checkoutLimit };
    // The address comes from the buyer's own address book; the order keeps a copy.
    const addressId = String(formData.get("addressId") ?? "");
    const address = /^[a-z0-9]{20,32}$/i.test(addressId) ? await getAddress(user.id, addressId) : null;
    if (!address) return { error: t.actions.chooseAddress };
    // Checking out an accepted offer; createOrder checks it belongs to this buyer and listing.
    const rawOffer = formData.get("offerId");
    const offerId = typeof rawOffer === "string" && rawOffer ? idSchema.parse(rawOffer) : undefined;
    const res = await orders.createOrder(user.id, listingId, shippingSnapshot(address), offerId);
    invalidate(res.tags);
    orderId = res.orderId;
  });
  if (orderId) redirect(localePath(`/account/orders/${orderId}?pay=1`, (await actionI18n()).locale));
  return result;
}

/** Generic wrapper for simple order transitions identified by orderId. */
async function orderStep(orderId: string, fn: (userId: string) => Promise<{ tags: string[] }>, message: ActionMessage) {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(orderId);
    const res = await fn(user.id);
    invalidate(res.tags);
    return { ok: true, message: t.actions[message] };
  });
}

export async function payOrderAction(orderId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  let paymentPage: string | undefined;
  const result = await runAction(async () => {
    const user = await requireTraderStrict();
    const { locale, t } = await actionI18n();
    idSchema.parse(orderId);
    const limited = await rateLimit(`pay:${user.id}`, 30, 3600);
    if (!limited.ok) return { error: t.actions.passwordLimit };
    const res = await orders.payOrder(orderId, user.id, locale);
    invalidate(res.tags);
    if ("redirectUrl" in res) paymentPage = res.redirectUrl;
    else return { ok: true, message: t.actions.paid };
  });
  if (paymentPage) redirect(paymentPage);
  return result;
}

export async function cancelOrderAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const reason = text(0, 300).catch("").parse(formData.get("reason") ?? "");
  return orderStep(orderId, (uid) => orders.cancelOrder(orderId, uid, reason), "cancelled");
}

/** Where a bank-transfer refund goes; the buyer is emailed about every change. */
export async function saveRefundAccountAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(orderId);
    const limited = await rateLimit(`refund-account:${user.id}`, 10, 86_400);
    if (!limited.ok) return { error: t.actions.passwordLimit };
    const input = payoutAccountSchema.parse(formToObject(formData));
    const res = await orders.setRefundAccount(orderId, user.id, input);
    invalidate(res.tags);
    await audit(user.id, "refund.account_set", "Order", orderId, { bank: input.bank, last4: input.accountNumber.slice(-4) });
    refresh();
    return { ok: true, message: t.actions.refundAccountSaved(input.accountName) };
  });
}

export async function shipOrderAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(orderId);
    const { carrier, trackingNumber } = shipSchema.parse(formToObject(formData));
    const res = await orders.shipOrder(orderId, user.id, carrier, trackingNumber);
    invalidate(res.tags);
    return { ok: true, message: t.actions.shipped };
  });
}

export async function confirmDeliveryAction(orderId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return orderStep(orderId, (uid) => orders.confirmDelivery(orderId, uid), "delivered");
}

export async function acceptOrderAction(orderId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return orderStep(orderId, (uid) => orders.acceptOrder(orderId, uid), "accepted");
}

export async function requestReturnAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(orderId);
    const { reason, details } = returnRequestSchema.parse(formToObject(formData));
    const res = await orders.requestReturn(orderId, user.id, reason, details);
    invalidate(res.tags);
    return { ok: true, message: t.actions.returnRequested };
  });
}

export async function respondReturnAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(orderId);
    const approve = formData.get("decision") === "approve";
    const note = text(0, 1000).parse(formData.get("note") ?? "");
    const res = await orders.respondToReturn(orderId, user.id, approve, note);
    invalidate(res.tags);
    return { ok: true, message: approve ? t.actions.returnApproved : t.actions.returnRejected };
  });
}

export async function shipReturnAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(orderId);
    const { carrier, trackingNumber } = shipSchema.parse(formToObject(formData));
    const res = await orders.shipReturn(orderId, user.id, carrier, trackingNumber);
    invalidate(res.tags);
    return { ok: true, message: t.actions.returnShipped };
  });
}

export async function receiveReturnAction(orderId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return orderStep(orderId, (uid) => orders.receiveReturn(orderId, uid), "returnReceived");
}

export async function openDisputeAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let disputeId: string | undefined;
  const result = await runAction(async () => {
    const user = await requireTraderStrict();
    idSchema.parse(orderId);
    const { reason, description } = disputeSchema.parse(formToObject(formData));
    const res = await orders.openDispute(orderId, user.id, reason, description);
    invalidate(res.tags);
    disputeId = res.disputeId;
    await audit(user.id, "dispute.open", "Dispute", res.disputeId, { orderId, reason });
  });
  if (disputeId) redirect(localePath(`/disputes/${disputeId}`, (await actionI18n()).locale));
  return result;
}

export async function postDisputeMessageAction(disputeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    idSchema.parse(disputeId);
    const limited = await rateLimit(`dispute-msg:${user.id}`, 30, 3600);
    if (!limited.ok) return { error: t.actions.messagesTooFast };
    const { body } = disputeMessageSchema.parse(formToObject(formData));

    const dispute = await db.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, order: { select: { buyerId: true, seller: { select: { userId: true } } } } },
    });
    if (!dispute) return { error: t.actions.disputeNotFound };
    const role =
      user.role === "ADMIN"
        ? "ADMIN"
        : dispute.order.buyerId === user.id
          ? "BUYER"
          : dispute.order.seller.userId === user.id
            ? "SELLER"
            : null;
    if (!role) return { error: t.actions.disputeNotFound };
    if (dispute.status === "RESOLVED") return { error: t.actions.disputeClosed };

    await db.$transaction(async (tx) => {
      await tx.disputeMessage.create({ data: { disputeId, authorId: user.id, authorRole: role, body } });
      await tx.dispute.update({ where: { id: disputeId }, data: { updatedAt: new Date() } });
      await enqueueDisputeMessageEmails(tx, disputeId, role);
    });
    // The dispute page reads uncached; re-render it with the new message.
    refresh();
    return { ok: true };
  });
}

export async function leaveReviewAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(orderId);
    const { rating, comment } = reviewSchema.parse(formToObject(formData));
    const res = await orders.leaveReview(orderId, user.id, rating, comment);
    invalidate(res.tags);
    return { ok: true, message: t.actions.reviewThanks };
  });
}
