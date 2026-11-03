import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { EventParams, EventType } from "@/i18n/messages";
import { isLocale, type Locale } from "@/i18n/locales";
import { enqueueEmail } from "@/lib/email/outbox";
import type { OrderRole } from "@/lib/email/templates";

// Who is emailed about what. Each order event notifies the party that needs
// to act or would want to know; the one who acted isn't told about their own
// action. Every (event, role) pair here has copy in the dictionaries' emails.order.

type Tx = Prisma.TransactionClient;

export const ORDER_EMAIL_RECIPIENTS: { [T in EventType]?: (p: EventParams<T>) => OrderRole[] } = {
  PAID: () => ["buyer", "seller"],
  // An unpaid order the buyer drops never reached the seller, so only paid ones are worth an email.
  CANCELLED: (p) => (p.by === "seller" ? ["buyer"] : p.refunded ? ["seller"] : []),
  EXPIRED: () => ["buyer"],
  SHIPPED: () => ["buyer"],
  DELIVERED: (p) => (p.auto ? ["buyer", "seller"] : ["seller"]),
  COMPLETED: () => ["buyer", "seller"],
  RETURN_REQUESTED: () => ["seller"],
  RETURN_APPROVED: () => ["buyer"],
  RETURN_REJECTED: () => ["buyer"],
  RETURN_SHIPPED: () => ["seller"],
  REFUNDED: () => ["buyer"],
  DISPUTE_OPENED: (p) => [p.by === "buyer" ? "seller" : "buyer"],
  DISPUTE_RESOLVED: () => ["buyer", "seller"],
  REFUND_BY_HAND: () => ["buyer"],
  // The buyer set it themselves, but it says where their money goes: an email
  // tells them if someone else did (an account takeover).
  REFUND_ACCOUNT_SET: () => ["buyer"],
  REFUND_SENT: () => ["buyer"],
};

const localeOf = (value: string): Locale => (isLocale(value) ? value : "id");

/** Queue the emails for an order event, in the same transaction that records it. */
export async function enqueueOrderEmails<T extends EventType>(tx: Tx, orderId: string, type: T, params: EventParams<T>) {
  const pick = ORDER_EMAIL_RECIPIENTS[type] as ((p: EventParams<T>) => OrderRole[]) | undefined;
  const roles = pick?.(params) ?? [];
  if (roles.length === 0) return;

  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      number: true,
      listingSnapshot: true,
      buyer: { select: { id: true, locale: true } },
      seller: { select: { user: { select: { id: true, locale: true } } } },
    },
  });
  let title = "";
  try {
    title = String(JSON.parse(order.listingSnapshot).title ?? "");
  } catch {
    /* keep the email without a title */
  }
  for (const role of roles) {
    const user = role === "buyer" ? order.buyer : order.seller.user;
    await enqueueEmail(tx, { userId: user.id, locale: localeOf(user.locale) }, {
      template: "order-event",
      params: { orderId, number: order.number, title, type, role, event: params as Record<string, unknown> },
    });
  }
}

/** Tell the other people in a dispute that someone added a message. */
export async function enqueueDisputeMessageEmails(tx: Tx, disputeId: string, from: "BUYER" | "SELLER" | "ADMIN") {
  const dispute = await tx.dispute.findUniqueOrThrow({
    where: { id: disputeId },
    select: {
      order: {
        select: { number: true, buyer: { select: { id: true, locale: true } }, seller: { select: { user: { select: { id: true, locale: true } } } } },
      },
    },
  });
  const { order } = dispute;
  const recipients = [...(from !== "BUYER" ? [order.buyer] : []), ...(from !== "SELLER" ? [order.seller.user] : [])];
  for (const user of recipients) {
    await enqueueEmail(tx, { userId: user.id, locale: localeOf(user.locale) }, { template: "dispute-message", params: { disputeId, number: order.number, from } });
  }
}
