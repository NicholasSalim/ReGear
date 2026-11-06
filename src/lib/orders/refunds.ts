import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { REFUND_BY_HAND_DAYS } from "@/lib/constants";
import { paymentKey, payments, REFUND_BY_HAND_METHODS, refundsByHand } from "@/lib/payments";
import { bankName, BANKS, maskAccount } from "@/lib/payouts/provider";
import { addEvent, type Tx } from "@/lib/orders/events";
import type { Prisma } from "@/generated/prisma/client";

// Refunds. An order step that gives money back (a cancellation, a received
// return, a dispute, a payment that landed on a cancelled order) claims the
// refund in its own transaction by setting refundIdr; everything after that
// lives here. Most refunds go back through the payment provider and are
// retried until it confirms them. A bank transfer can't be: the buyer gives
// an account and an admin sends the money by hand.

/** What the refund rules need to know about an order. */
export type RefundFacts = {
  refundIdr: number;
  refundedAt: Date | null;
  paymentMethod: string | null;
  refundBank: string | null;
  refundAccountNumber: string | null;
  refundAccountName: string | null;
};

export type RefundAccount = { bank: string; accountNumber: string; accountName: string };

/** Where an order's refund stands. */
export type RefundState =
  | { kind: "none" }
  /** Going back through the payment provider; retried until it confirms. */
  | { kind: "onItsWay"; amountIdr: number }
  /** A bank transfer: waiting for the buyer to say where to send it. */
  | { kind: "needsAccount"; amountIdr: number }
  /** A bank transfer: the buyer gave an account, waiting for ReGear to send it. */
  | { kind: "awaitingTransfer"; amountIdr: number; account: RefundAccount }
  /** Sent. By hand, it went to `account`. */
  | { kind: "sent"; amountIdr: number; sentAt: Date; byHand: boolean; account: RefundAccount | null };

function accountOf(order: RefundFacts): RefundAccount | null {
  return order.refundBank && order.refundAccountNumber
    ? { bank: order.refundBank, accountNumber: order.refundAccountNumber, accountName: order.refundAccountName ?? "" }
    : null;
}

export function refundState(order: RefundFacts): RefundState {
  const amountIdr = order.refundIdr;
  if (amountIdr <= 0) return { kind: "none" };
  const byHand = refundsByHand(order.paymentMethod);
  const account = accountOf(order);
  if (order.refundedAt) return { kind: "sent", amountIdr, sentAt: order.refundedAt, byHand, account: byHand ? account : null };
  if (!byHand) return { kind: "onItsWay", amountIdr };
  return account ? { kind: "awaitingTransfer", amountIdr, account } : { kind: "needsAccount", amountIdr };
}

/**
 * Send a refund the order has already claimed (refundIdr set, refundedAt
 * empty). refundedAt is filled once the provider confirms it; one that fails
 * is retried by retryUnsentRefunds. A bank transfer can't go back through the
 * provider: the buyer is asked for an account instead, and an admin sends it.
 */
export async function sendRefund(order: { id: string; paymentRef: string | null; paymentMethod: string | null }, amountIdr: number) {
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

/** Claimed refunds the provider hasn't confirmed: send them again. Bank-transfer refunds wait for an admin instead. Run by the maintenance job. */
export async function retryUnsentRefunds() {
  const unsent = await db.order.findMany({
    where: { refundIdr: { gt: 0 }, refundedAt: null, OR: [{ paymentMethod: null }, { paymentMethod: { notIn: REFUND_BY_HAND_METHODS } }] },
    select: { id: true, paymentRef: true, paymentMethod: true, refundIdr: true },
    take: 200,
  });
  for (const o of unsent) await sendRefund(o, o.refundIdr);
  return unsent.length;
}

/** The order, if it owes its buyer a bank-transfer refund that hasn't been sent. */
async function refundOwedByHand(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new DomainError("noRefundByHand");
  const state = refundState(order);
  if (state.kind !== "needsAccount" && state.kind !== "awaitingTransfer") throw new DomainError("noRefundByHand");
  return { order, state };
}

/** Where the buyer wants a bank-transfer refund sent. They can change it until it's sent, and are emailed each time. */
export async function setRefundAccount(orderId: string, buyerId: string, input: RefundAccount) {
  if (!BANKS.some((b) => b.code === input.bank)) throw new DomainError("bankNotSupported");
  const result = await db.$transaction(async (tx) => {
    const { order } = await refundOwedByHand(tx, orderId);
    if (order.buyerId !== buyerId) throw new DomainError("orderNotFound");
    await tx.order.update({ where: { id: orderId }, data: { refundBank: input.bank, refundAccountNumber: input.accountNumber, refundAccountName: input.accountName } });
    await addEvent(tx, orderId, "REFUND_ACCOUNT_SET", { bank: bankName(input.bank), account: maskAccount(input.accountNumber) }, buyerId);
    return { orderId };
  });
  await audit(buyerId, "refund.account_set", "Order", orderId, { bank: input.bank, last4: input.accountNumber.slice(-4) });
  return result;
}

/** An admin sent a bank-transfer refund to the account the buyer gave. */
export async function markRefundSent(orderId: string, adminId: string, note: string) {
  const result = await db.$transaction(async (tx) => {
    const { state } = await refundOwedByHand(tx, orderId);
    if (state.kind !== "awaitingTransfer") throw new DomainError("refundAccountMissing");
    // Compare-and-swap: two admins marking it at once record it once.
    const sent = await tx.order.updateMany({ where: { id: orderId, refundedAt: null }, data: { refundedAt: new Date(), refundNote: note } });
    if (sent.count !== 1) throw new DomainError("concurrentUpdate");
    await addEvent(
      tx,
      orderId,
      "REFUND_SENT",
      { amount: formatMoney(state.amountIdr), bank: bankName(state.account.bank), account: maskAccount(state.account.accountNumber) },
      adminId,
    );
    return { orderId };
  });
  await audit(adminId, "refund.mark_sent", "Order", orderId, { note });
  return result;
}

/** The admin's Refunds page: bank-transfer refunds to send (with an account), still waiting for one, and recently sent. */
export async function byHandRefunds() {
  const select = {
    id: true,
    number: true,
    refundIdr: true,
    refundBank: true,
    refundAccountNumber: true,
    refundAccountName: true,
    refundedAt: true,
    refundNote: true,
    paymentMethod: true,
    buyer: { select: { id: true, name: true, email: true } },
    // When the refund became owed.
    events: { where: { type: "REFUND_BY_HAND" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
  } satisfies Prisma.OrderSelect;
  const byHand = { refundIdr: { gt: 0 }, paymentMethod: { in: REFUND_BY_HAND_METHODS } } satisfies Prisma.OrderWhereInput;
  const [owed, sent] = await Promise.all([
    db.order.findMany({ where: { ...byHand, refundedAt: null }, orderBy: { updatedAt: "asc" }, take: 200, select }),
    db.order.findMany({ where: { ...byHand, refundedAt: { not: null } }, orderBy: { refundedAt: "desc" }, take: 20, select }),
  ]);
  return {
    toSend: owed.filter((o) => refundState(o).kind === "awaitingTransfer"),
    waiting: owed.filter((o) => refundState(o).kind === "needsAccount"),
    sent,
  };
}
