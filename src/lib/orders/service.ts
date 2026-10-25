import "server-only";
import { en } from "@/i18n/dictionaries/en";
import { resolveEntry, type EventParams, type EventType } from "@/i18n/messages";
import { db } from "@/lib/db";
import { listingTags, TAGS } from "@/lib/cache";
import { currencyCode } from "@/lib/format";
import { payments } from "@/lib/payments";
import { enqueueOrderEmails } from "@/lib/email/notify";
import type { Prisma } from "@/generated/prisma/client";
import {
  AUTO_COMPLETE_DAYS_AFTER_DELIVERY_BUFFER,
  PAYMENT_HOLD_MINUTES,
  PLATFORM_FEE_BPS,
  type OrderStatus,
} from "@/lib/constants";
import {
  assertTransition,
  calculateFees,
  canOpenDispute,
  generateOrderNumber,
  isWithinReturnWindow,
} from "@/lib/orders/state";
import type { Address } from "@/lib/validation";

// Order domain service. All order mutations live here so that authorization,
// state transitions, listing inventory and the event log stay consistent no
// matter which entry point (Server Action, cron) triggers them.

type DomainMessages = typeof en.domain;
export type DomainCode = keyof DomainMessages;
type DomainArgs<K extends DomainCode> = DomainMessages[K] extends (...args: infer A) => string ? A : [];

/** An expected business-rule failure. The message is English (logs, tests); actions show `code` in the visitor's language. */
export class DomainError<K extends DomainCode = DomainCode> extends Error {
  readonly code: K;
  readonly args: DomainArgs<K>;
  constructor(code: K, ...args: DomainArgs<K>) {
    super(resolveEntry(en.domain[code], args));
    this.name = "DomainError";
    this.code = code;
    this.args = args;
  }
}

type Tx = Prisma.TransactionClient;
type Result = { orderId: string; tags: string[] };

// Events keep their details as params so the timeline can word them in the
// viewer's language; the English text is stored too, for logs and admins.
async function addEvent<T extends EventType>(tx: Tx, orderId: string, type: T, params: EventParams<T>, actorId?: string | null) {
  const message = resolveEntry(en.events[type], [params]);
  await tx.orderEvent.create({ data: { orderId, type, message, params: JSON.stringify(params), actorId: actorId ?? null } });
  await enqueueOrderEmails(tx, orderId, type, params);
}

async function setStatus(tx: Tx, orderId: string, from: string, to: OrderStatus, data: Prisma.OrderUpdateInput = {}) {
  assertTransition(from, to);
  // Optimistic concurrency: the update only applies if nobody changed the status meanwhile.
  const res = await tx.order.updateMany({ where: { id: orderId, status: from }, data: { ...data, status: to } as Prisma.OrderUpdateManyMutationInput });
  if (res.count !== 1) throw new DomainError("concurrentUpdate");
}

function tagsFor(order: { listingId: string; sellerId: string; buyerId: string }) {
  return [...listingTags({ id: order.listingId, sellerId: order.sellerId }), `orders-${order.buyerId}`];
}

async function loadOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { seller: { select: { userId: true } }, returnRequest: true, dispute: true },
  });
  if (!order) throw new DomainError("orderNotFound");
  return order;
}

function assertBuyer(order: { buyerId: string }, userId: string) {
  if (order.buyerId !== userId) throw new DomainError("orderNotFound");
}
function assertSeller(order: { seller: { userId: string } }, userId: string) {
  if (order.seller.userId !== userId) throw new DomainError("orderNotFound");
}

// Checkout -----------------------------------------------------------------

export async function createOrder(buyerId: string, listingId: string, address: Address): Promise<Result> {
  return db.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      include: {
        seller: { select: { userId: true } },
        images: { select: { key: true }, orderBy: { position: "asc" }, take: 1 },
      },
    });
    if (!listing || listing.status !== "ACTIVE") throw new DomainError("itemUnavailable");
    if (listing.seller.userId === buyerId) throw new DomainError("ownListing");

    // Atomically reserve: only one buyer can win the ACTIVE -> RESERVED race.
    const reserved = await tx.listing.updateMany({ where: { id: listingId, status: "ACTIVE" }, data: { status: "RESERVED" } });
    if (reserved.count !== 1) throw new DomainError("justReserved");

    const fees = calculateFees(listing.priceIdr, listing.shippingIdr, PLATFORM_FEE_BPS);
    const order = await tx.order.create({
      data: {
        number: generateOrderNumber(),
        buyerId,
        sellerId: listing.sellerId,
        listingId,
        priceIdr: listing.priceIdr,
        shippingIdr: listing.shippingIdr,
        platformFeeIdr: fees.platformFeeIdr,
        totalIdr: fees.totalIdr,
        returnWindowDays: listing.returnWindowDays,
        shippingAddress: JSON.stringify(address),
        listingSnapshot: JSON.stringify({
          title: listing.title,
          slug: listing.slug,
          conditionGrade: listing.conditionGrade,
          imageKey: listing.images[0]?.key ?? null,
          warrantyType: listing.warrantyType,
          warrantyMonths: listing.warrantyMonths,
          warrantyTerms: listing.warrantyTerms,
        }),
      },
    });
    await addEvent(tx, order.id, "CREATED", { minutes: PAYMENT_HOLD_MINUTES }, buyerId);
    return { orderId: order.id, tags: tagsFor(order) };
  });
}

export async function payOrder(orderId: string, buyerId: string): Promise<Result> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new DomainError("orderNotFound");
  assertBuyer(order, buyerId);
  if (order.status !== "PENDING_PAYMENT") throw new DomainError("alreadyPaid");
  if (Date.now() - order.createdAt.getTime() > PAYMENT_HOLD_MINUTES * 60_000) {
    await expireUnpaidOrder(order.id);
    throw new DomainError("paymentExpired");
  }

  const charge = await payments.charge({ orderId, amountIdr: order.totalIdr, currency: currencyCode });
  return db.$transaction(async (tx) => {
    await setStatus(tx, orderId, "PENDING_PAYMENT", "PAID", { paidAt: new Date(), paymentRef: charge.ref });
    await addEvent(tx, orderId, "PAID", {}, buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

export async function cancelOrder(orderId: string, userId: string, reason: string): Promise<Result> {
  const order = await db.$transaction((tx) => loadOrder(tx, orderId));
  const isBuyer = order.buyerId === userId;
  const isSeller = order.seller.userId === userId;
  if (!isBuyer && !isSeller) throw new DomainError("orderNotFound");
  if (isBuyer && order.status !== "PENDING_PAYMENT" && order.status !== "PAID") {
    throw new DomainError("cancelBeforeShip");
  }
  if (isSeller && order.status !== "PENDING_PAYMENT" && order.status !== "PAID") {
    throw new DomainError("cancelBeforeShip");
  }

  let refundRef: string | null = null;
  if (order.status === "PAID" && order.paymentRef) {
    refundRef = (await payments.refund({ ref: order.paymentRef, amountIdr: order.totalIdr })).ref;
  }
  return db.$transaction(async (tx) => {
    await setStatus(tx, orderId, order.status, "CANCELLED", {
      cancelledAt: new Date(),
      ...(refundRef ? { refundIdr: order.totalIdr, refundedAt: new Date() } : {}),
    });
    await tx.listing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
    const who = isBuyer ? ("buyer" as const) : ("seller" as const);
    await addEvent(
      tx,
      orderId,
      "CANCELLED",
      { by: who, ...(reason ? { reason } : {}), refunded: !!refundRef },
      userId,
    );
    return { orderId, tags: tagsFor(order) };
  });
}

export async function expireUnpaidOrder(orderId: string) {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PENDING_PAYMENT") return;
    await setStatus(tx, orderId, "PENDING_PAYMENT", "CANCELLED", { cancelledAt: new Date() });
    await tx.listing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
    await addEvent(tx, orderId, "EXPIRED", {});
  });
}

// Fulfilment ----------------------------------------------------------------

export async function shipOrder(orderId: string, sellerUserId: string, carrier: string, trackingNumber: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertSeller(order, sellerUserId);
    await setStatus(tx, orderId, order.status, "SHIPPED", { shippedAt: new Date(), carrier, trackingNumber });
    await addEvent(tx, orderId, "SHIPPED", { carrier, tracking: trackingNumber }, sellerUserId);
    return { orderId, tags: tagsFor(order) };
  });
}

export async function confirmDelivery(orderId: string, buyerId: string | null): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (buyerId) assertBuyer(order, buyerId);
    await setStatus(tx, orderId, order.status, "DELIVERED", { deliveredAt: new Date() });
    await addEvent(tx, orderId, "DELIVERED", { auto: !buyerId, returnDays: order.returnWindowDays }, buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

async function completeInTx(tx: Tx, order: { id: string; status: string; listingId: string; sellerId: string; paymentRef: string | null; totalIdr: number; platformFeeIdr: number; refundIdr: number }, actorId: string | null, by: "buyer" | "window") {
  await setStatus(tx, order.id, order.status, "COMPLETED", { completedAt: new Date() });
  await tx.listing.update({ where: { id: order.listingId }, data: { status: "SOLD" } });
  await tx.sellerProfile.update({ where: { id: order.sellerId }, data: { salesCount: { increment: 1 } } });
  await addEvent(tx, order.id, "COMPLETED", { by }, actorId);
}

export async function acceptOrder(orderId: string, buyerId: string): Promise<Result> {
  const result = await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertBuyer(order, buyerId);
    await completeInTx(tx, order, buyerId, "buyer");
    return { order, result: { orderId, tags: [...tagsFor(order), TAGS.seller(order.sellerId)] } };
  });
  await payments.payout({
    orderId,
    sellerId: result.order.sellerId,
    amountIdr: result.order.totalIdr - result.order.platformFeeIdr,
  });
  return result.result;
}

export async function autoCompleteOrder(orderId: string) {
  const order = await db.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId } });
    if (!o || o.status !== "DELIVERED") return null;
    await completeInTx(tx, o, null, "window");
    return o;
  });
  if (order) {
    await payments.payout({ orderId, sellerId: order.sellerId, amountIdr: order.totalIdr - order.platformFeeIdr });
  }
  return order ? tagsFor(order) : [];
}

// Returns -------------------------------------------------------------------

export async function requestReturn(orderId: string, buyerId: string, reason: string, details: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertBuyer(order, buyerId);
    if (!isWithinReturnWindow(order)) throw new DomainError("returnWindowClosed");
    if (order.returnRequest) throw new DomainError("returnAlreadyRequested");
    await setStatus(tx, orderId, "DELIVERED", "RETURN_IN_PROGRESS");
    await tx.returnRequest.create({ data: { orderId, reason, details } });
    await addEvent(tx, orderId, "RETURN_REQUESTED", {}, buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

export async function respondToReturn(orderId: string, sellerUserId: string, approve: boolean, note: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertSeller(order, sellerUserId);
    if (order.returnRequest?.status !== "REQUESTED") throw new DomainError("noPendingReturn");
    if (approve) {
      await tx.returnRequest.update({ where: { orderId }, data: { status: "APPROVED", sellerNote: note || null } });
      await addEvent(tx, orderId, "RETURN_APPROVED", {}, sellerUserId);
    } else {
      if (note.length < 10) throw new DomainError("rejectReasonShort");
      await tx.returnRequest.update({ where: { orderId }, data: { status: "REJECTED", sellerNote: note } });
      await setStatus(tx, orderId, "RETURN_IN_PROGRESS", "DELIVERED");
      await addEvent(tx, orderId, "RETURN_REJECTED", { note }, sellerUserId);
    }
    return { orderId, tags: tagsFor(order) };
  });
}

export async function shipReturn(orderId: string, buyerId: string, carrier: string, tracking: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertBuyer(order, buyerId);
    if (order.status !== "RETURN_IN_PROGRESS" || order.returnRequest?.status !== "APPROVED") {
      throw new DomainError("returnNotAwaitingShipment");
    }
    await tx.returnRequest.update({
      where: { orderId },
      data: { status: "SHIPPED_BACK", returnCarrier: carrier, returnTracking: tracking },
    });
    await addEvent(tx, orderId, "RETURN_SHIPPED", { carrier, tracking }, buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

export async function receiveReturn(orderId: string, sellerUserId: string): Promise<Result> {
  const order = await db.$transaction((tx) => loadOrder(tx, orderId));
  assertSeller(order, sellerUserId);
  if (order.status !== "RETURN_IN_PROGRESS" || order.returnRequest?.status !== "SHIPPED_BACK") {
    throw new DomainError("returnNotShippedBack");
  }
  if (order.paymentRef) await payments.refund({ ref: order.paymentRef, amountIdr: order.totalIdr });
  return db.$transaction(async (tx) => {
    await tx.returnRequest.update({ where: { orderId }, data: { status: "REFUNDED" } });
    await setStatus(tx, orderId, "RETURN_IN_PROGRESS", "REFUNDED", { refundedAt: new Date(), refundIdr: order.totalIdr });
    // Item is back with the seller; they must review it before relisting.
    await tx.listing.update({ where: { id: order.listingId }, data: { status: "DRAFT" } });
    await addEvent(tx, orderId, "REFUNDED", {}, sellerUserId);
    return { orderId, tags: tagsFor(order) };
  });
}

// Disputes ------------------------------------------------------------------

export async function openDispute(orderId: string, userId: string, reason: string, description: string): Promise<Result & { disputeId: string }> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    const role = order.buyerId === userId ? "BUYER" : order.seller.userId === userId ? "SELLER" : null;
    if (!role) throw new DomainError("orderNotFound");
    if (order.dispute) throw new DomainError("disputeAlreadyOpen");
    if (!canOpenDispute(order)) throw new DomainError("disputeNotAllowed");
    if (reason === "NOT_RECEIVED" && order.status !== "SHIPPED" && order.status !== "PAID") {
      throw new DomainError("notReceivedBeforeDelivery");
    }
    await setStatus(tx, orderId, order.status, "DISPUTED");
    const dispute = await tx.dispute.create({
      data: {
        orderId,
        openedById: userId,
        reason,
        description,
        messages: { create: { authorId: userId, authorRole: role, body: description } },
      },
    });
    await addEvent(tx, orderId, "DISPUTE_OPENED", { by: role === "BUYER" ? "buyer" : "seller" }, userId);
    return { orderId, disputeId: dispute.id, tags: tagsFor(order) };
  });
}

export async function resolveDispute(
  disputeId: string,
  adminId: string,
  resolution: "REFUND_BUYER" | "PARTIAL_REFUND" | "RELEASE_TO_SELLER",
  note: string,
  partialIdr = 0,
): Promise<Result> {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId }, include: { order: true } });
  if (!dispute) throw new DomainError("disputeNotFound");
  if (dispute.status === "RESOLVED") throw new DomainError("disputeResolved");
  const order = dispute.order;
  if (order.status !== "DISPUTED") throw new DomainError("orderNotInDispute");

  let refundIdr = 0;
  if (resolution === "REFUND_BUYER") refundIdr = order.totalIdr;
  if (resolution === "PARTIAL_REFUND") {
    if (partialIdr <= 0 || partialIdr >= order.totalIdr) {
      throw new DomainError("partialRefundRange");
    }
    refundIdr = partialIdr;
  }
  if (refundIdr > 0 && order.paymentRef) await payments.refund({ ref: order.paymentRef, amountIdr: refundIdr });
  if (resolution !== "REFUND_BUYER") {
    await payments.payout({ orderId: order.id, sellerId: order.sellerId, amountIdr: order.totalIdr - order.platformFeeIdr - refundIdr });
  }

  return db.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED", resolution, resolutionNote: note, refundIdr, resolvedById: adminId, resolvedAt: new Date() },
    });
    await tx.disputeMessage.create({
      data: { disputeId, authorId: adminId, authorRole: "ADMIN", body: `${en.disputes.system.resolutionPrefix}${note}` },
    });
    if (resolution === "REFUND_BUYER") {
      await setStatus(tx, order.id, "DISPUTED", "REFUNDED", { refundedAt: new Date(), refundIdr });
      await tx.listing.update({ where: { id: order.listingId }, data: { status: "DRAFT" } });
      await addEvent(tx, order.id, "DISPUTE_RESOLVED", { outcome: "buyer" }, adminId);
    } else {
      await setStatus(tx, order.id, "DISPUTED", "COMPLETED", {
        completedAt: new Date(),
        ...(refundIdr ? { refundIdr, refundedAt: new Date() } : {}),
      });
      await tx.listing.update({ where: { id: order.listingId }, data: { status: "SOLD" } });
      await tx.sellerProfile.update({ where: { id: order.sellerId }, data: { salesCount: { increment: 1 } } });
      await addEvent(
        tx,
        order.id,
        "DISPUTE_RESOLVED",
        { outcome: resolution === "PARTIAL_REFUND" ? "partial" : "seller" },
        adminId,
      );
    }
    return { orderId: order.id, tags: tagsFor(order) };
  });
}

// Reviews -------------------------------------------------------------------

export async function leaveReview(orderId: string, buyerId: string, rating: number, comment: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertBuyer(order, buyerId);
    if (order.status !== "COMPLETED") throw new DomainError("reviewAfterCompletion");
    const existing = await tx.review.findUnique({ where: { orderId } });
    if (existing) throw new DomainError("alreadyReviewed");
    await tx.review.create({ data: { orderId, sellerId: order.sellerId, buyerId, rating, comment } });
    const agg = await tx.review.aggregate({ where: { sellerId: order.sellerId }, _avg: { rating: true }, _count: true });
    await tx.sellerProfile.update({
      where: { id: order.sellerId },
      data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count },
    });
    return { orderId, tags: [TAGS.seller(order.sellerId), TAGS.listing(order.listingId)] };
  });
}

// Maintenance ---------------------------------------------------------------

/** Expire unpaid orders, auto-deliver long-shipped orders, auto-complete closed return windows. */
export async function runOrderMaintenance(now = new Date()) {
  const tags: string[] = [];
  const stale = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(now.getTime() - PAYMENT_HOLD_MINUTES * 60_000) } },
    select: { id: true, listingId: true, sellerId: true, buyerId: true },
    take: 500,
  });
  for (const o of stale) {
    await expireUnpaidOrder(o.id);
    tags.push(...tagsFor(o));
  }

  const longShipped = await db.order.findMany({
    where: { status: "SHIPPED", shippedAt: { lt: new Date(now.getTime() - 21 * 86_400_000) } },
    select: { id: true },
    take: 500,
  });
  for (const o of longShipped) {
    try {
      const r = await confirmDelivery(o.id, null);
      tags.push(...r.tags);
    } catch (err) {
      console.error("auto-deliver failed", o.id, err);
    }
  }

  const delivered = await db.order.findMany({
    where: { status: "DELIVERED" },
    select: { id: true, deliveredAt: true, returnWindowDays: true },
    take: 1000,
  });
  for (const o of delivered) {
    const closesAt = (o.deliveredAt?.getTime() ?? 0) + (o.returnWindowDays + AUTO_COMPLETE_DAYS_AFTER_DELIVERY_BUFFER) * 86_400_000;
    if (closesAt < now.getTime()) {
      try {
        tags.push(...(await autoCompleteOrder(o.id)));
      } catch (err) {
        console.error("auto-complete failed", o.id, err);
      }
    }
  }
  return { expired: stale.length, autoDelivered: longShipped.length, tags: [...new Set(tags)] };
}
