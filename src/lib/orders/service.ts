import "server-only";
import { db } from "@/lib/db";
import { listingTags, TAGS } from "@/lib/cache";
import { currencyCode } from "@/lib/format";
import { payments } from "@/lib/payments";
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

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

type Tx = Prisma.TransactionClient;
type Result = { orderId: string; tags: string[] };

async function addEvent(tx: Tx, orderId: string, type: string, message: string, actorId?: string | null) {
  await tx.orderEvent.create({ data: { orderId, type, message, actorId: actorId ?? null } });
}

async function setStatus(tx: Tx, orderId: string, from: string, to: OrderStatus, data: Prisma.OrderUpdateInput = {}) {
  assertTransition(from, to);
  // Optimistic concurrency: the update only applies if nobody changed the status meanwhile.
  const res = await tx.order.updateMany({ where: { id: orderId, status: from }, data: { ...data, status: to } as Prisma.OrderUpdateManyMutationInput });
  if (res.count !== 1) throw new DomainError("This order was updated by someone else. Refresh and try again.");
}

function tagsFor(order: { listingId: string; sellerId: string; buyerId: string }) {
  return [...listingTags({ id: order.listingId, sellerId: order.sellerId }), `orders-${order.buyerId}`];
}

async function loadOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { seller: { select: { userId: true } }, returnRequest: true, dispute: true },
  });
  if (!order) throw new DomainError("Order not found");
  return order;
}

function assertBuyer(order: { buyerId: string }, userId: string) {
  if (order.buyerId !== userId) throw new DomainError("Order not found");
}
function assertSeller(order: { seller: { userId: string } }, userId: string) {
  if (order.seller.userId !== userId) throw new DomainError("Order not found");
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
    if (!listing || listing.status !== "ACTIVE") throw new DomainError("This item is no longer available.");
    if (listing.seller.userId === buyerId) throw new DomainError("You cannot buy your own listing.");

    // Atomically reserve: only one buyer can win the ACTIVE -> RESERVED race.
    const reserved = await tx.listing.updateMany({ where: { id: listingId, status: "ACTIVE" }, data: { status: "RESERVED" } });
    if (reserved.count !== 1) throw new DomainError("Someone just reserved this item.");

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
    await addEvent(tx, order.id, "CREATED", `Order placed. Item reserved for ${PAYMENT_HOLD_MINUTES} minutes pending payment.`, buyerId);
    return { orderId: order.id, tags: tagsFor(order) };
  });
}

export async function payOrder(orderId: string, buyerId: string): Promise<Result> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new DomainError("Order not found");
  assertBuyer(order, buyerId);
  if (order.status !== "PENDING_PAYMENT") throw new DomainError("This order has already been paid or closed.");
  if (Date.now() - order.createdAt.getTime() > PAYMENT_HOLD_MINUTES * 60_000) {
    await expireUnpaidOrder(order.id);
    throw new DomainError("The payment window expired and the item was released.");
  }

  const charge = await payments.charge({ orderId, amountIdr: order.totalIdr, currency: currencyCode });
  return db.$transaction(async (tx) => {
    await setStatus(tx, orderId, "PENDING_PAYMENT", "PAID", { paidAt: new Date(), paymentRef: charge.ref });
    await addEvent(tx, orderId, "PAID", "Payment received and held securely by ReGear until you confirm the item.", buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

export async function cancelOrder(orderId: string, userId: string, reason: string): Promise<Result> {
  const order = await db.$transaction((tx) => loadOrder(tx, orderId));
  const isBuyer = order.buyerId === userId;
  const isSeller = order.seller.userId === userId;
  if (!isBuyer && !isSeller) throw new DomainError("Order not found");
  if (isBuyer && order.status !== "PENDING_PAYMENT" && order.status !== "PAID") {
    throw new DomainError("Orders can only be cancelled before they ship.");
  }
  if (isSeller && order.status !== "PENDING_PAYMENT" && order.status !== "PAID") {
    throw new DomainError("Orders can only be cancelled before they ship.");
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
    const who = isBuyer ? "buyer" : "seller";
    await addEvent(
      tx,
      orderId,
      "CANCELLED",
      `Order cancelled by the ${who}${reason ? `: ${reason}` : "."}${refundRef ? " Full refund issued." : ""}`,
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
    await addEvent(tx, orderId, "EXPIRED", "Payment was not completed in time; the item was released.");
  });
}

// Fulfilment ----------------------------------------------------------------

export async function shipOrder(orderId: string, sellerUserId: string, carrier: string, trackingNumber: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertSeller(order, sellerUserId);
    await setStatus(tx, orderId, order.status, "SHIPPED", { shippedAt: new Date(), carrier, trackingNumber });
    await addEvent(tx, orderId, "SHIPPED", `Shipped with ${carrier}, tracking number ${trackingNumber}.`, sellerUserId);
    return { orderId, tags: tagsFor(order) };
  });
}

export async function confirmDelivery(orderId: string, buyerId: string | null): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (buyerId) assertBuyer(order, buyerId);
    await setStatus(tx, orderId, order.status, "DELIVERED", { deliveredAt: new Date() });
    const window = order.returnWindowDays > 0 ? ` You have ${order.returnWindowDays} days to inspect the item and request a return.` : "";
    await addEvent(
      tx,
      orderId,
      "DELIVERED",
      buyerId ? `Buyer confirmed delivery.${window}` : `Marked delivered automatically after carrier transit time.${window}`,
      buyerId,
    );
    return { orderId, tags: tagsFor(order) };
  });
}

async function completeInTx(tx: Tx, order: { id: string; status: string; listingId: string; sellerId: string; paymentRef: string | null; totalIdr: number; platformFeeIdr: number; refundIdr: number }, actorId: string | null, message: string) {
  await setStatus(tx, order.id, order.status, "COMPLETED", { completedAt: new Date() });
  await tx.listing.update({ where: { id: order.listingId }, data: { status: "SOLD" } });
  await tx.sellerProfile.update({ where: { id: order.sellerId }, data: { salesCount: { increment: 1 } } });
  await addEvent(tx, order.id, "COMPLETED", message, actorId);
}

export async function acceptOrder(orderId: string, buyerId: string): Promise<Result> {
  const result = await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertBuyer(order, buyerId);
    await completeInTx(tx, order, buyerId, "Buyer accepted the item. Payment released to the seller.");
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
    await completeInTx(tx, o, null, "Return window closed. Order completed and payment released to the seller.");
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
    if (!isWithinReturnWindow(order)) throw new DomainError("The return window for this order has closed.");
    if (order.returnRequest) throw new DomainError("A return was already requested for this order.");
    await setStatus(tx, orderId, "DELIVERED", "RETURN_IN_PROGRESS");
    await tx.returnRequest.create({ data: { orderId, reason, details } });
    await addEvent(tx, orderId, "RETURN_REQUESTED", "Buyer requested a return. Waiting for the seller to respond.", buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

export async function respondToReturn(orderId: string, sellerUserId: string, approve: boolean, note: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertSeller(order, sellerUserId);
    if (order.returnRequest?.status !== "REQUESTED") throw new DomainError("There is no pending return request.");
    if (approve) {
      await tx.returnRequest.update({ where: { orderId }, data: { status: "APPROVED", sellerNote: note || null } });
      await addEvent(tx, orderId, "RETURN_APPROVED", "Seller approved the return. Please ship the item back and add tracking.", sellerUserId);
    } else {
      if (note.length < 10) throw new DomainError("Explain why the return is rejected (at least 10 characters).");
      await tx.returnRequest.update({ where: { orderId }, data: { status: "REJECTED", sellerNote: note } });
      await setStatus(tx, orderId, "RETURN_IN_PROGRESS", "DELIVERED");
      await addEvent(tx, orderId, "RETURN_REJECTED", `Seller rejected the return: ${note}. The buyer can escalate by opening a dispute.`, sellerUserId);
    }
    return { orderId, tags: tagsFor(order) };
  });
}

export async function shipReturn(orderId: string, buyerId: string, carrier: string, tracking: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertBuyer(order, buyerId);
    if (order.status !== "RETURN_IN_PROGRESS" || order.returnRequest?.status !== "APPROVED") {
      throw new DomainError("This return is not awaiting shipment.");
    }
    await tx.returnRequest.update({
      where: { orderId },
      data: { status: "SHIPPED_BACK", returnCarrier: carrier, returnTracking: tracking },
    });
    await addEvent(tx, orderId, "RETURN_SHIPPED", `Buyer shipped the item back with ${carrier}, tracking ${tracking}.`, buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

export async function receiveReturn(orderId: string, sellerUserId: string): Promise<Result> {
  const order = await db.$transaction((tx) => loadOrder(tx, orderId));
  assertSeller(order, sellerUserId);
  if (order.status !== "RETURN_IN_PROGRESS" || order.returnRequest?.status !== "SHIPPED_BACK") {
    throw new DomainError("This return has not been shipped back yet.");
  }
  if (order.paymentRef) await payments.refund({ ref: order.paymentRef, amountIdr: order.totalIdr });
  return db.$transaction(async (tx) => {
    await tx.returnRequest.update({ where: { orderId }, data: { status: "REFUNDED" } });
    await setStatus(tx, orderId, "RETURN_IN_PROGRESS", "REFUNDED", { refundedAt: new Date(), refundIdr: order.totalIdr });
    // Item is back with the seller; they must review it before relisting.
    await tx.listing.update({ where: { id: order.listingId }, data: { status: "DRAFT" } });
    await addEvent(tx, orderId, "REFUNDED", "Seller received the returned item. Full refund issued to the buyer.", sellerUserId);
    return { orderId, tags: tagsFor(order) };
  });
}

// Disputes ------------------------------------------------------------------

export async function openDispute(orderId: string, userId: string, reason: string, description: string): Promise<Result & { disputeId: string }> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    const role = order.buyerId === userId ? "BUYER" : order.seller.userId === userId ? "SELLER" : null;
    if (!role) throw new DomainError("Order not found");
    if (order.dispute) throw new DomainError("A dispute is already open for this order.");
    if (!canOpenDispute(order)) throw new DomainError("A dispute cannot be opened for this order at its current stage.");
    if (reason === "NOT_RECEIVED" && order.status !== "SHIPPED" && order.status !== "PAID") {
      throw new DomainError("'Not received' disputes are only possible before delivery is confirmed.");
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
    await addEvent(tx, orderId, "DISPUTE_OPENED", `${role === "BUYER" ? "Buyer" : "Seller"} opened a dispute. Payment is frozen until ReGear resolves it.`, userId);
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
  if (!dispute) throw new DomainError("Dispute not found");
  if (dispute.status === "RESOLVED") throw new DomainError("Dispute already resolved");
  const order = dispute.order;
  if (order.status !== "DISPUTED") throw new DomainError("Order is not in dispute");

  let refundIdr = 0;
  if (resolution === "REFUND_BUYER") refundIdr = order.totalIdr;
  if (resolution === "PARTIAL_REFUND") {
    if (partialIdr <= 0 || partialIdr >= order.totalIdr) {
      throw new DomainError("Partial refund must be greater than 0 and less than the order total.");
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
      data: { disputeId, authorId: adminId, authorRole: "ADMIN", body: `Resolution: ${note}` },
    });
    if (resolution === "REFUND_BUYER") {
      await setStatus(tx, order.id, "DISPUTED", "REFUNDED", { refundedAt: new Date(), refundIdr });
      await tx.listing.update({ where: { id: order.listingId }, data: { status: "DRAFT" } });
      await addEvent(tx, order.id, "DISPUTE_RESOLVED", "Dispute resolved in the buyer's favour. Full refund issued.", adminId);
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
        resolution === "PARTIAL_REFUND"
          ? "Dispute resolved with a partial refund to the buyer; the remainder was released to the seller."
          : "Dispute resolved in the seller's favour. Payment released to the seller.",
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
    if (order.status !== "COMPLETED") throw new DomainError("You can review the seller once the order is completed.");
    const existing = await tx.review.findUnique({ where: { orderId } });
    if (existing) throw new DomainError("You already reviewed this order.");
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
