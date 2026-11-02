import "server-only";
import { en } from "@/i18n/dictionaries/en";
import { resolveEntry, type EventParams, type EventType } from "@/i18n/messages";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { listingTags, TAGS } from "@/lib/cache";
import { currencyCode } from "@/lib/format";
import { paymentKey, payments } from "@/lib/payments";
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
  InvalidTransitionError,
  isWithinReturnWindow,
} from "@/lib/orders/state";
import type { ShippingAddress } from "@/lib/addresses";

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

/**
 * Reserve the listing and open an order awaiting payment. With `offerId`, the
 * item is priced at that offer, which must be this buyer's, for this listing,
 * accepted and not expired; it's used up in the same transaction.
 */
export async function createOrder(buyerId: string, listingId: string, address: ShippingAddress, offerId?: string): Promise<Result> {
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

    let priceIdr = listing.priceIdr;
    if (offerId) {
      const offer = await tx.offer.findUnique({ where: { id: offerId }, select: { buyerId: true, listingId: true, amountIdr: true } });
      if (!offer || offer.buyerId !== buyerId || offer.listingId !== listingId) throw new DomainError("offerNotFound");
      // Only an accepted, unexpired offer can be used, and only once.
      const used = await tx.offer.updateMany({ where: { id: offerId, status: "ACCEPTED", expiresAt: { gt: new Date() } }, data: { status: "USED" } });
      if (used.count !== 1) throw new DomainError("offerClosed");
      priceIdr = offer.amountIdr;
    }

    // Atomically reserve: only one buyer can win the ACTIVE -> RESERVED race.
    const reserved = await tx.listing.updateMany({ where: { id: listingId, status: "ACTIVE" }, data: { status: "RESERVED" } });
    if (reserved.count !== 1) throw new DomainError("justReserved");

    const fees = calculateFees(priceIdr, listing.shippingIdr, PLATFORM_FEE_BPS);
    const order = await tx.order.create({
      data: {
        number: generateOrderNumber(),
        buyerId,
        sellerId: listing.sellerId,
        listingId,
        offerId: offerId ?? null,
        priceIdr,
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
    // Bought, so no longer something to buy.
    await tx.cartItem.deleteMany({ where: { userId: buyerId, listingId } });
    return { orderId: order.id, tags: tagsFor(order) };
  });
}

type UnpaidOrder = { id: string; status: string; buyerId: string; sellerId: string; listingId: string; totalIdr: number };

async function markPaid(order: UnpaidOrder, ref: string): Promise<string[]> {
  await db.$transaction(async (tx) => {
    await setStatus(tx, order.id, "PENDING_PAYMENT", "PAID", { paidAt: new Date(), paymentRef: ref });
    await addEvent(tx, order.id, "PAID", {}, order.buyerId);
  });
  return tagsFor(order);
}

/** Record a payment the provider reports. Returns the tags to invalidate (none if someone else recorded it first). */
async function confirmPaid(order: UnpaidOrder, paid: { ref: string; amountIdr: number }): Promise<string[]> {
  if (paid.amountIdr !== order.totalIdr) {
    console.error(`[payments] order ${order.id} paid ${paid.amountIdr} IDR, expected ${order.totalIdr}; not marking it paid`);
    return [];
  }
  try {
    return await markPaid(order, paid.ref);
  } catch (err) {
    // The webhook and the buyer's return from the payment page often arrive together.
    if (err instanceof DomainError && err.code === "concurrentUpdate") return [];
    throw err;
  }
}

/**
 * Bring an order in line with what the payment provider says. "Paid" only
 * ever comes from here (or from the simulated provider), never from the
 * buyer's browser or an unverified notification.
 */
export async function syncPayment(orderId: string): Promise<string[]> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return [];
  if (order.status === "PENDING_PAYMENT") {
    const state = await payments.status(orderId);
    if (state.state === "paid") return confirmPaid(order, state);
    if (state.state === "failed") return (await expireUnpaidOrder(orderId)) === "expired" ? tagsFor(order) : [];
    return [];
  }
  // Expiring the payment before cancelling should make this impossible, but if
  // a payment still lands on a cancelled order, the money goes straight back.
  if (order.status === "CANCELLED" && order.paymentUrl && !order.paymentRef) {
    const state = await payments.status(orderId);
    if (state.state === "paid") {
      console.error(`[payments] order ${orderId} was paid after it was cancelled; refunding`);
      await payments.refund({ idempotencyKey: paymentKey(orderId, "refund"), orderId, ref: state.ref, amountIdr: state.amountIdr });
      await db.order.update({ where: { id: orderId }, data: { paymentRef: state.ref, refundIdr: state.amountIdr, refundedAt: new Date() } });
    }
  }
  return [];
}

/** Paid at once (simulated provider) or a page on the provider's site to send the buyer to. */
export type PayResult = Result & ({ paid: true } | { redirectUrl: string });

export async function payOrder(orderId: string, buyerId: string, locale: Locale = DEFAULT_LOCALE): Promise<PayResult> {
  let order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new DomainError("orderNotFound");
  assertBuyer(order, buyerId);
  if (order.status !== "PENDING_PAYMENT") throw new DomainError("alreadyPaid");

  // A payment page already exists: the buyer may have paid there already.
  if (order.paymentUrl) {
    const tags = await syncPayment(orderId);
    order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === "PAID") return { orderId, tags, paid: true };
    if (order.status !== "PENDING_PAYMENT") throw new DomainError("paymentExpired");
  }
  const holdEndsAt = new Date(order.createdAt.getTime() + PAYMENT_HOLD_MINUTES * 60_000);
  if (Date.now() > holdEndsAt.getTime()) {
    if ((await expireUnpaidOrder(order.id)) === "paid") return { orderId, tags: tagsFor(order), paid: true };
    throw new DomainError("paymentExpired");
  }
  if (order.paymentUrl) return { orderId, tags: [], redirectUrl: order.paymentUrl };

  const started = await payments.checkout({
    idempotencyKey: paymentKey(orderId, "charge"),
    orderId,
    amountIdr: order.totalIdr,
    currency: currencyCode,
    expiresAt: holdEndsAt,
    itemName: (JSON.parse(order.listingSnapshot) as { title: string }).title,
    // The provider sends the buyer back here, which checks the payment and shows the order.
    returnUrl: `${env.NEXT_PUBLIC_SITE_URL}/api/payments/return?order=${orderId}&lang=${locale}`,
  });
  if ("paid" in started) return { orderId, tags: await markPaid(order, started.paid.ref), paid: true };
  // Keep the first page (a double click opens two) so the buyer always returns to the same one.
  await db.order.updateMany({ where: { id: orderId, paymentUrl: null }, data: { paymentUrl: started.redirectUrl } });
  const saved = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { paymentUrl: true } });
  return { orderId, tags: [], redirectUrl: saved.paymentUrl ?? started.redirectUrl };
}

export async function cancelOrder(orderId: string, userId: string, reason: string): Promise<Result> {
  let order = await db.$transaction((tx) => loadOrder(tx, orderId));
  if (order.status === "PENDING_PAYMENT" && (order.buyerId === userId || order.seller.userId === userId)) {
    // Close the payment page first; if the buyer paid in the meantime, this
    // becomes the cancellation of a paid order and the money is refunded.
    const state = await payments.abandon(orderId);
    if (state.state === "paid" && (await confirmPaid(order, state)).length) order = await db.$transaction((tx) => loadOrder(tx, orderId));
  }
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
    refundRef = (await payments.refund({ idempotencyKey: paymentKey(order.id, "refund"), orderId: order.id, ref: order.paymentRef, amountIdr: order.totalIdr })).ref;
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

/** Release an unpaid order's item. Returns "paid" if the buyer turned out to have paid, null if there was nothing to do. */
export async function expireUnpaidOrder(orderId: string): Promise<"expired" | "paid" | null> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDING_PAYMENT") return null;
  // Stop the payment first, so the buyer can't pay for an item that's back on sale.
  const state = await payments.abandon(orderId);
  if (state.state === "paid") return (await confirmPaid(order, state)).length ? "paid" : null;

  return db.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: orderId } });
    if (!current || current.status !== "PENDING_PAYMENT") return null;
    await setStatus(tx, orderId, "PENDING_PAYMENT", "CANCELLED", { cancelledAt: new Date() });
    await tx.listing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
    await addEvent(tx, orderId, "EXPIRED", {});
    return "expired" as const;
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
    // Only a shipment can be delivered. (RETURN_IN_PROGRESS -> DELIVERED is the
    // seller rejecting a return, not something a buyer may trigger.)
    if (order.status !== "SHIPPED") throw new InvalidTransitionError(order.status, "DELIVERED");
    await setStatus(tx, orderId, "SHIPPED", "DELIVERED", { deliveredAt: new Date() });
    await addEvent(tx, orderId, "DELIVERED", { auto: !buyerId, returnDays: order.returnWindowDays }, buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

/** The seller's share of a completed order goes into their balance, once per order (unique per order). */
async function creditSeller(tx: Tx, order: { id: string; sellerId: string; totalIdr: number; platformFeeIdr: number }, refundIdr: number) {
  await tx.balanceEntry.create({ data: { sellerId: order.sellerId, type: "SALE", orderId: order.id, amountIdr: order.totalIdr - order.platformFeeIdr - refundIdr } });
}

async function completeInTx(tx: Tx, order: { id: string; status: string; listingId: string; sellerId: string; totalIdr: number; platformFeeIdr: number; refundIdr: number }, actorId: string | null, by: "buyer" | "window") {
  await setStatus(tx, order.id, order.status, "COMPLETED", { completedAt: new Date() });
  await tx.listing.update({ where: { id: order.listingId }, data: { status: "SOLD" } });
  await tx.sellerProfile.update({ where: { id: order.sellerId }, data: { salesCount: { increment: 1 } } });
  await creditSeller(tx, order, order.refundIdr);
  await addEvent(tx, order.id, "COMPLETED", { by }, actorId);
}

export async function acceptOrder(orderId: string, buyerId: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertBuyer(order, buyerId);
    // A disputed order is settled by an admin, not by the buyer accepting it.
    if (order.status !== "DELIVERED") throw new InvalidTransitionError(order.status, "COMPLETED");
    await completeInTx(tx, order, buyerId, "buyer");
    return { orderId, tags: [...tagsFor(order), TAGS.seller(order.sellerId)] };
  });
}

export async function autoCompleteOrder(orderId: string) {
  const order = await db.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId } });
    if (!o || o.status !== "DELIVERED") return null;
    await completeInTx(tx, o, null, "window");
    return o;
  });
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
  if (order.paymentRef) await payments.refund({ idempotencyKey: paymentKey(order.id, "refund"), orderId: order.id, ref: order.paymentRef, amountIdr: order.totalIdr });
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
    // The seller's payout (total - platform fee - refund) must stay positive.
    if (partialIdr <= 0 || partialIdr >= order.totalIdr - order.platformFeeIdr) {
      throw new DomainError("partialRefundRange");
    }
    refundIdr = partialIdr;
  }
  if (refundIdr > 0 && order.paymentRef) await payments.refund({ idempotencyKey: paymentKey(order.id, "refund"), orderId: order.id, ref: order.paymentRef, amountIdr: refundIdr });

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
      await creditSeller(tx, order, refundIdr);
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

/** Settle payments we weren't told about, expire unpaid orders, auto-deliver long-shipped orders, auto-complete closed return windows. */
export async function runOrderMaintenance(now = new Date()) {
  const tags: string[] = [];
  const holdStart = new Date(now.getTime() - PAYMENT_HOLD_MINUTES * 60_000);

  // A lost or blocked webhook mustn't leave a paid order waiting.
  const awaiting = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", paymentUrl: { not: null }, createdAt: { gte: holdStart } },
    select: { id: true },
    take: 200,
  });
  for (const o of awaiting) {
    try {
      tags.push(...(await syncPayment(o.id)));
    } catch (err) {
      console.error("payment sync failed", o.id, err);
    }
  }

  const stale = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: holdStart } },
    select: { id: true, listingId: true, sellerId: true, buyerId: true },
    take: 500,
  });
  let expired = 0;
  for (const o of stale) {
    try {
      const outcome = await expireUnpaidOrder(o.id);
      if (outcome === "expired") expired++;
      if (outcome) tags.push(...tagsFor(o));
    } catch (err) {
      console.error("expire failed", o.id, err);
    }
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
  return { expired, autoDelivered: longShipped.length, tags: [...new Set(tags)] };
}
