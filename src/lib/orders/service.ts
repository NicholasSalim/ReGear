import "server-only";
import { en } from "@/i18n/dictionaries/en";
import { resolveEntry, type EventParams, type EventType } from "@/i18n/messages";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { listingTags, TAGS } from "@/lib/cache";
import { currencyCode, formatMoney } from "@/lib/format";
import { paymentKey, payments, REFUND_BY_HAND_METHODS, refundsByHand } from "@/lib/payments";
import { bankName, BANKS, maskAccount } from "@/lib/payouts/provider";
import { enqueueOrderEmails } from "@/lib/email/notify";
import type { Order, Prisma } from "@/generated/prisma/client";
import {
  AUTO_COMPLETE_DAYS_AFTER_DELIVERY_BUFFER,
  MAX_ABANDONED_CHECKOUTS,
  MAX_UNPAID_ORDERS,
  PAY_HOLD_MINUTES,
  PAYMENT_HOLD_MINUTES,
  PLATFORM_FEE_BPS,
  REFUND_BY_HAND_DAYS,
  type OrderStatus,
} from "@/lib/constants";
import {
  assertTransition,
  calculateFees,
  generateOrderNumber,
  InvalidTransitionError,
  orderCapabilities,
  sellerPayoutIdr,
  type OrderFacts,
  type Step,
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
    include: { seller: { select: { userId: true } }, returnRequest: true, dispute: true, review: { select: { id: true } } },
  });
  if (!order) throw new DomainError("orderNotFound");
  return order;
}

/** Refuse a buyer's or seller's step that Order capabilities doesn't allow, with its reason. */
function requireStep(order: OrderFacts, viewer: "BUYER" | "SELLER", step: Step) {
  const check = orderCapabilities(order, viewer).steps[step];
  if (check.allowed) return;
  if (check.reason === "invalidTransition") throw new InvalidTransitionError(order.status, check.to);
  throw new DomainError(check.reason);
}

function assertBuyer(order: { buyerId: string }, userId: string) {
  if (order.buyerId !== userId) throw new DomainError("orderNotFound");
}
function assertSeller(order: { seller: { userId: string } }, userId: string) {
  if (order.seller.userId !== userId) throw new DomainError("orderNotFound");
}

// Checkout -----------------------------------------------------------------

/**
 * Open an order awaiting payment. The item stays on sale: it's held only once
 * the buyer presses Pay (see payOrder), so an order nobody pays for blocks no
 * one. With `offerId`, the item is priced at that offer, which must be this
 * buyer's, for this listing, accepted and not expired; it's used up in the
 * same transaction (and given back if the order is cancelled unpaid).
 */
export async function createOrder(buyerId: string, listingId: string, address: ShippingAddress, offerId?: string): Promise<Result> {
  await releaseLapsedHold(listingId);
  return db.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      include: {
        seller: { select: { userId: true } },
        images: { select: { key: true }, orderBy: { position: "asc" }, take: 1 },
      },
    });
    if (!listing) throw new DomainError("itemUnavailable");
    if (listing.status !== "ACTIVE") throw await unavailable(tx, listingId);
    if (listing.seller.userId === buyerId) throw new DomainError("ownListing");

    // Locking the buyer's row makes the checks below hold against parallel checkouts.
    const [buyer] = await tx.$queryRaw<{ role: string }[]>`SELECT "role" FROM "User" WHERE "id" = ${buyerId} FOR UPDATE`;
    // Admins decide disputes, so they can't be a party to an order.
    if (buyer?.role === "ADMIN") throw new DomainError("adminCannotTrade");
    // Checking out the same item twice (a double click, a second tab) gives the same order.
    const open = await tx.order.findFirst({ where: { buyerId, listingId, status: "PENDING_PAYMENT" }, select: { id: true, listingId: true, sellerId: true, buyerId: true } });
    if (open) return { orderId: open.id, tags: tagsFor(open) };
    const unpaid = await tx.order.count({ where: { buyerId, status: "PENDING_PAYMENT" } });
    if (unpaid >= MAX_UNPAID_ORDERS) throw new DomainError("tooManyUnpaidOrders", MAX_UNPAID_ORDERS);
    // Someone who keeps starting payment and letting the hold lapse waits a day.
    const abandoned = await tx.order.count({
      where: { buyerId, listingId, status: "CANCELLED", paidAt: null, reservedAt: { not: null }, cancelledAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    if (abandoned >= MAX_ABANDONED_CHECKOUTS) throw new DomainError("checkoutAgainLater");

    let priceIdr = listing.priceIdr;
    if (offerId) {
      const offer = await tx.offer.findUnique({ where: { id: offerId }, select: { buyerId: true, listingId: true, amountIdr: true } });
      if (!offer || offer.buyerId !== buyerId || offer.listingId !== listingId) throw new DomainError("offerNotFound");
      // Only an accepted, unexpired offer can be used, and only once.
      const used = await tx.offer.updateMany({ where: { id: offerId, status: "ACCEPTED", expiresAt: { gt: new Date() } }, data: { status: "USED" } });
      if (used.count !== 1) throw new DomainError("offerClosed");
      priceIdr = offer.amountIdr;
    }

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

async function markPaid(order: UnpaidOrder, ref: string, method?: string): Promise<string[]> {
  await db.$transaction(async (tx) => {
    await setStatus(tx, order.id, "PENDING_PAYMENT", "PAID", { paidAt: new Date(), paymentRef: ref, paymentMethod: method ?? null });
    await addEvent(tx, order.id, "PAID", {}, order.buyerId);
  });
  return tagsFor(order);
}

/** Record a payment the provider reports. Returns the tags to invalidate (none if someone else recorded it first). */
async function confirmPaid(order: UnpaidOrder, paid: { ref: string; amountIdr: number; method?: string }): Promise<string[]> {
  if (paid.amountIdr !== order.totalIdr) {
    console.error(`[payments] order ${order.id} paid ${paid.amountIdr} IDR, expected ${order.totalIdr}; not marking it paid`);
    return [];
  }
  try {
    return await markPaid(order, paid.ref, paid.method);
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
      // Claimed first, like every refund, so a repeated check sends it once.
      const claimed = await db.order.updateMany({
        where: { id: orderId, paymentRef: null },
        data: { paymentRef: state.ref, paymentMethod: state.method ?? null, refundIdr: state.amountIdr },
      });
      if (claimed.count === 1) await sendClaimedRefund({ id: orderId, paymentRef: state.ref, paymentMethod: state.method ?? null }, state.amountIdr);
    }
  }
  return [];
}

/** Paid at once (simulated provider) or a page on the provider's site to send the buyer to. */
export type PayResult = Result & ({ paid: true } | { redirectUrl: string });

/**
 * When an unpaid order closes: PAY_HOLD_MINUTES after the buyer started paying
 * (the item's hold, and the payment page, end then), otherwise
 * PAYMENT_HOLD_MINUTES after checkout.
 */
function unpaidClosesAt(order: { createdAt: Date; reservedAt: Date | null }) {
  return order.reservedAt ? order.reservedAt.getTime() + PAY_HOLD_MINUTES * 60_000 : order.createdAt.getTime() + PAYMENT_HOLD_MINUTES * 60_000;
}

/** Why a listing that isn't on sale can't be bought: someone is paying for it right now, or it's gone. */
async function unavailable(tx: Tx, listingId: string) {
  const paying = await tx.order.count({ where: { listingId, status: "PENDING_PAYMENT", reservedAt: { not: null } } });
  return new DomainError(paying ? "beingPaid" : "itemUnavailable");
}

/** A hold on this listing that has run out is released now, rather than whenever maintenance next runs. */
async function releaseLapsedHold(listingId: string) {
  const lapsed = await db.order.findFirst({
    where: { listingId, status: "PENDING_PAYMENT", reservedAt: { lt: new Date(Date.now() - PAY_HOLD_MINUTES * 60_000) } },
    select: { id: true },
  });
  if (lapsed) await expireUnpaidOrder(lapsed.id);
}

/** Take the item off sale for this order. Only one order can hold it; anyone else is told it's being paid for. */
async function holdForPayment(order: { id: string; listingId: string }) {
  return db.$transaction(async (tx) => {
    const held = await tx.listing.updateMany({ where: { id: order.listingId, status: "ACTIVE" }, data: { status: "RESERVED" } });
    if (held.count !== 1) {
      // A double click: this same order already holds it.
      const mine = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      if (mine.reservedAt && mine.status === "PENDING_PAYMENT") return mine;
      throw await unavailable(tx, order.listingId);
    }
    const claimed = await tx.order.updateMany({ where: { id: order.id, status: "PENDING_PAYMENT", reservedAt: null }, data: { reservedAt: new Date() } });
    if (claimed.count !== 1) throw new DomainError("concurrentUpdate");
    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}

/** An unpaid order closing: free the item if this order was holding it, and give back the offer it used. */
async function closeUnpaid(tx: Tx, order: { id: string; listingId: string; reservedAt: Date | null; offerId: string | null }) {
  if (order.reservedAt) await tx.listing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
  if (order.offerId) {
    // Unlinked first: an offer belongs to one order at a time.
    await tx.order.update({ where: { id: order.id }, data: { offerId: null } });
    await tx.offer.updateMany({ where: { id: order.offerId, status: "USED" }, data: { status: "ACCEPTED" } });
  }
}

export async function payOrder(orderId: string, buyerId: string, locale: Locale = DEFAULT_LOCALE): Promise<PayResult> {
  const found = await db.$transaction((tx) => loadOrder(tx, orderId));
  assertBuyer(found, buyerId);
  requireStep(found, "BUYER", "pay");
  let order: Order = found;

  // A payment page already exists: the buyer may have paid there already.
  if (order.paymentUrl) {
    const tags = await syncPayment(orderId);
    order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === "PAID") return { orderId, tags, paid: true };
    if (order.status !== "PENDING_PAYMENT") throw new DomainError("paymentExpired");
  }
  if (Date.now() > unpaidClosesAt(order)) {
    if ((await expireUnpaidOrder(order.id)) === "paid") return { orderId, tags: tagsFor(order), paid: true };
    throw new DomainError("paymentExpired");
  }
  // The item is held from here, for this buyer only, while they pay.
  if (!order.reservedAt) {
    await releaseLapsedHold(order.listingId);
    order = await holdForPayment(order);
  }
  const holdEndsAt = new Date(order.reservedAt!.getTime() + PAY_HOLD_MINUTES * 60_000);
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
  if (!isBuyer && order.seller.userId !== userId) throw new DomainError("orderNotFound");
  requireStep(order, isBuyer ? "BUYER" : "SELLER", "cancel");
  return finishCancel(order, isBuyer ? "buyer" : "seller", userId, reason);
}

/**
 * ReGear cancels an order that hasn't shipped, refunding a paid one: used when
 * the buyer or the seller is banned. Returns null if it had already moved on.
 */
export async function cancelOrderByAdmin(orderId: string, adminId: string | null): Promise<Result | null> {
  let order = await db.$transaction((tx) => loadOrder(tx, orderId));
  if (order.status === "PENDING_PAYMENT") {
    const state = await payments.abandon(orderId);
    if (state.state === "paid" && (await confirmPaid(order, state)).length) order = await db.$transaction((tx) => loadOrder(tx, orderId));
  }
  if (order.status !== "PENDING_PAYMENT" && order.status !== "PAID") return null;
  return finishCancel(order, "admin", adminId, "");
}

async function finishCancel(order: Awaited<ReturnType<typeof loadOrder>>, by: "buyer" | "seller" | "admin", actorId: string | null, reason: string): Promise<Result> {
  // Claim the cancellation before any money moves: a shipment or dispute that
  // races this one then fails here, instead of after the buyer was refunded.
  const refunds = order.status === "PAID" && !!order.paymentRef;
  const result = await db.$transaction(async (tx) => {
    await setStatus(tx, order.id, order.status, "CANCELLED", { cancelledAt: new Date(), ...(refunds ? { refundIdr: order.totalIdr } : {}) });
    if (order.status === "PAID") await tx.listing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
    else await closeUnpaid(tx, order);
    await addEvent(tx, order.id, "CANCELLED", { by, ...(reason ? { reason } : {}), refunded: refunds }, actorId);
    return { orderId: order.id, tags: tagsFor(order) };
  });
  if (refunds) await sendClaimedRefund(order, order.totalIdr);
  return result;
}

type PaidOrder = { id: string; paymentRef: string | null; paymentMethod: string | null };

/**
 * Send a refund the order has already committed to (refundIdr set, refundedAt
 * empty). refundedAt is filled once the provider confirms it; a refund that
 * fails here is retried by runOrderMaintenance. A bank transfer can't be sent
 * back through the provider: the buyer is asked for an account instead, and
 * an admin sends it (markRefundSent).
 */
async function sendClaimedRefund(order: PaidOrder, amountIdr: number) {
  if (!order.paymentMethod && order.paymentRef) order = { ...order, paymentMethod: await lookUpPaymentMethod(order.id) };
  if (refundsByHand(order.paymentMethod)) {
    await db.$transaction((tx) => addEvent(tx, order.id, "REFUND_BY_HAND", { amount: formatMoney(amountIdr), days: REFUND_BY_HAND_DAYS }));
    return;
  }
  try {
    // No provider payment to refund (e.g. seeded data): nothing to send.
    if (order.paymentRef) await payments.refund({ idempotencyKey: paymentKey(order.id, "refund"), orderId: order.id, ref: order.paymentRef, amountIdr });
    await db.order.update({ where: { id: order.id }, data: { refundedAt: new Date() } });
  } catch (err) {
    console.error("[payments] refund failed; maintenance will retry", order.id, err);
  }
}

/**
 * How an order was paid, asked of the provider and saved. Orders paid before
 * the method was recorded (or recorded by an older deployment) don't know it,
 * and refunding a bank transfer through the provider would only fail.
 */
async function lookUpPaymentMethod(orderId: string) {
  try {
    const state = await payments.status(orderId);
    if (state.state !== "paid" || !state.method) return null;
    await db.order.updateMany({ where: { id: orderId, paymentMethod: null }, data: { paymentMethod: state.method } });
    return state.method;
  } catch (err) {
    console.error("[payments] couldn't look up how an order was paid", orderId, err);
    return null;
  }
}

/** The order, if it owes its buyer a bank-transfer refund that hasn't been sent. */
async function refundOwedByHand(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order || order.refundIdr <= 0 || order.refundedAt || !refundsByHand(order.paymentMethod)) throw new DomainError("noRefundByHand");
  return order;
}

/** Where the buyer wants a bank-transfer refund sent. They can change it until it's sent, and are emailed each time. */
export async function setRefundAccount(orderId: string, buyerId: string, input: { bank: string; accountNumber: string; accountName: string }): Promise<Result> {
  if (!BANKS.some((b) => b.code === input.bank)) throw new DomainError("bankNotSupported");
  return db.$transaction(async (tx) => {
    const order = await refundOwedByHand(tx, orderId);
    assertBuyer(order, buyerId);
    await tx.order.update({ where: { id: orderId }, data: { refundBank: input.bank, refundAccountNumber: input.accountNumber, refundAccountName: input.accountName } });
    await addEvent(tx, orderId, "REFUND_ACCOUNT_SET", { bank: bankName(input.bank), account: maskAccount(input.accountNumber) }, buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

/** An admin sent a bank-transfer refund to the account the buyer gave. */
export async function markRefundSent(orderId: string, adminId: string, note: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await refundOwedByHand(tx, orderId);
    if (!order.refundBank || !order.refundAccountNumber) throw new DomainError("refundAccountMissing");
    // Compare-and-swap: two admins marking it at once record it once.
    const sent = await tx.order.updateMany({ where: { id: orderId, refundedAt: null }, data: { refundedAt: new Date(), refundNote: note } });
    if (sent.count !== 1) throw new DomainError("concurrentUpdate");
    await addEvent(
      tx,
      orderId,
      "REFUND_SENT",
      { amount: formatMoney(order.refundIdr), bank: bankName(order.refundBank), account: maskAccount(order.refundAccountNumber) },
      adminId,
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
    await closeUnpaid(tx, current);
    await addEvent(tx, orderId, "EXPIRED", {});
    return "expired" as const;
  });
}

// Fulfilment ----------------------------------------------------------------

export async function shipOrder(orderId: string, sellerUserId: string, carrier: string, trackingNumber: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertSeller(order, sellerUserId);
    requireStep(order, "SELLER", "ship");
    await setStatus(tx, orderId, "PAID", "SHIPPED", { shippedAt: new Date(), carrier, trackingNumber });
    await addEvent(tx, orderId, "SHIPPED", { carrier, tracking: trackingNumber }, sellerUserId);
    return { orderId, tags: tagsFor(order) };
  });
}

export async function confirmDelivery(orderId: string, buyerId: string | null): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (buyerId) {
      assertBuyer(order, buyerId);
      requireStep(order, "BUYER", "confirmDelivery");
    } else if (order.status !== "SHIPPED") {
      // Only a shipment can be delivered.
      throw new InvalidTransitionError(order.status, "DELIVERED");
    }
    await setStatus(tx, orderId, "SHIPPED", "DELIVERED", { deliveredAt: new Date() });
    await addEvent(tx, orderId, "DELIVERED", { auto: !buyerId, returnDays: order.returnWindowDays }, buyerId);
    return { orderId, tags: tagsFor(order) };
  });
}

/** The seller's share of a completed order goes into their balance, once per order (unique per order). */
async function creditSeller(tx: Tx, order: { id: string; sellerId: string; totalIdr: number; platformFeeIdr: number }, refundIdr: number) {
  await tx.balanceEntry.create({ data: { sellerId: order.sellerId, type: "SALE", orderId: order.id, amountIdr: sellerPayoutIdr({ ...order, refundIdr }) } });
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
    requireStep(order, "BUYER", "accept");
    await completeInTx(tx, order, buyerId, "buyer");
    return { orderId, tags: [...tagsFor(order), TAGS.seller(order.sellerId)] };
  });
}

/**
 * When a delivered order completes on its own: the return window plus a buffer
 * after delivery. A rejected return restarts the buffer from the rejection, so
 * the buyer always has time to open the dispute they're offered. Null when
 * there's no delivery date to count from.
 */
export function autoCompleteAt(order: { deliveredAt: Date | null; returnWindowDays: number; returnRequest: { status: string; updatedAt: Date } | null }): number | null {
  if (!order.deliveredAt) return null;
  const buffer = AUTO_COMPLETE_DAYS_AFTER_DELIVERY_BUFFER * 86_400_000;
  const afterWindow = order.deliveredAt.getTime() + order.returnWindowDays * 86_400_000 + buffer;
  // A rejected request is never updated again, so updatedAt is when it was rejected.
  const afterRejection = order.returnRequest?.status === "REJECTED" ? order.returnRequest.updatedAt.getTime() + buffer : 0;
  return Math.max(afterWindow, afterRejection);
}

export async function autoCompleteOrder(orderId: string, now = new Date()) {
  const order = await db.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { returnRequest: { select: { status: true, updatedAt: true } } } });
    if (!o || o.status !== "DELIVERED") return null;
    const due = autoCompleteAt(o);
    if (due === null || due > now.getTime()) return null;
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
    requireStep(order, "BUYER", "requestReturn");
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
    requireStep(order, "SELLER", "respondToReturn");
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
    requireStep(order, "BUYER", "shipReturn");
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
  requireStep(order, "SELLER", "receiveReturn");
  // Claim the refund first, so a dispute opened meanwhile can't leave a refunded order still in play.
  const result = await db.$transaction(async (tx) => {
    await setStatus(tx, orderId, "RETURN_IN_PROGRESS", "REFUNDED", { refundIdr: order.totalIdr });
    await tx.returnRequest.update({ where: { orderId }, data: { status: "REFUNDED" } });
    // Item is back with the seller; they must review it before relisting.
    await tx.listing.update({ where: { id: order.listingId }, data: { status: "DRAFT" } });
    await addEvent(tx, orderId, "REFUNDED", {}, sellerUserId);
    return { orderId, tags: tagsFor(order) };
  });
  await sendClaimedRefund(order, order.totalIdr);
  return result;
}

// Disputes ------------------------------------------------------------------

export async function openDispute(orderId: string, userId: string, reason: string, description: string): Promise<Result & { disputeId: string }> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    const role = order.buyerId === userId ? "BUYER" : order.seller.userId === userId ? "SELLER" : null;
    if (!role) throw new DomainError("orderNotFound");
    requireStep(order, role, "reportProblem");
    if (reason === "NOT_RECEIVED" && !orderCapabilities(order, role).notReceivedAllowed) throw new DomainError("notReceivedBeforeDelivery");
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
  // The resolution is claimed (DISPUTED -> X) before any refund is sent, so a
  // second submission fails here instead of moving money a second time.
  const result = await db.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED", resolution, resolutionNote: note, refundIdr, resolvedById: adminId, resolvedAt: new Date() },
    });
    await tx.disputeMessage.create({
      data: { disputeId, authorId: adminId, authorRole: "ADMIN", body: `${en.disputes.system.resolutionPrefix}${note}` },
    });
    if (resolution === "REFUND_BUYER") {
      await setStatus(tx, order.id, "DISPUTED", "REFUNDED", { refundIdr });
      await tx.listing.update({ where: { id: order.listingId }, data: { status: "DRAFT" } });
      await addEvent(tx, order.id, "DISPUTE_RESOLVED", { outcome: "buyer" }, adminId);
    } else {
      await setStatus(tx, order.id, "DISPUTED", "COMPLETED", { completedAt: new Date(), ...(refundIdr ? { refundIdr } : {}) });
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
  if (refundIdr > 0) await sendClaimedRefund(order, refundIdr);
  return result;
}

// Reviews -------------------------------------------------------------------

export async function leaveReview(orderId: string, buyerId: string, rating: number, comment: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertBuyer(order, buyerId);
    requireStep(order, "BUYER", "review");
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
  const checkoutStart = new Date(now.getTime() - PAYMENT_HOLD_MINUTES * 60_000);
  const holdStart = new Date(now.getTime() - PAY_HOLD_MINUTES * 60_000);

  // A lost or blocked webhook mustn't leave a paid order waiting.
  const awaiting = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", paymentUrl: { not: null }, reservedAt: { gte: holdStart } },
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
    // Same rule as unpaidClosesAt: a started payment by its hold, otherwise by checkout time.
    where: { status: "PENDING_PAYMENT", OR: [{ reservedAt: null, createdAt: { lt: checkoutStart } }, { reservedAt: { lt: holdStart } }] },
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
    select: { id: true, deliveredAt: true, returnWindowDays: true, returnRequest: { select: { status: true, updatedAt: true } } },
    orderBy: { deliveredAt: "asc" },
    take: 1000,
  });
  for (const o of delivered) {
    const due = autoCompleteAt(o);
    if (due !== null && due <= now.getTime()) {
      try {
        tags.push(...(await autoCompleteOrder(o.id, now)));
      } catch (err) {
        console.error("auto-complete failed", o.id, err);
      }
    }
  }

  // Refunds are committed to before they're sent; send any that failed then.
  // Bank-transfer refunds wait for an admin instead (Admin → Refunds).
  const unsent = await db.order.findMany({
    where: { refundIdr: { gt: 0 }, refundedAt: null, OR: [{ paymentMethod: null }, { paymentMethod: { notIn: REFUND_BY_HAND_METHODS } }] },
    select: { id: true, paymentRef: true, paymentMethod: true, refundIdr: true },
    take: 200,
  });
  for (const o of unsent) await sendClaimedRefund(o, o.refundIdr);
  return { expired, autoDelivered: longShipped.length, tags: [...new Set(tags)] };
}
