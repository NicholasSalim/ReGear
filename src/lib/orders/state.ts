import type { OrderStatus } from "@/lib/constants";

// Order lifecycle state machine. Every status change in the app goes through
// assertTransition() so illegal jumps (e.g. SHIPPED -> PENDING_PAYMENT) are
// impossible regardless of which action triggers them.
//
// Funds are conceptually held in escrow from PAID until COMPLETED/REFUNDED.
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED", "DISPUTED"],
  SHIPPED: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["COMPLETED", "RETURN_IN_PROGRESS", "DISPUTED"],
  RETURN_IN_PROGRESS: ["REFUNDED", "DELIVERED", "DISPUTED"],
  DISPUTED: ["REFUNDED", "COMPLETED"],
  COMPLETED: [],
  REFUNDED: [],
  CANCELLED: [],
};

export function canTransition(from: string, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from as OrderStatus] ?? []).includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Order cannot move from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: string, to: OrderStatus) {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["COMPLETED", "REFUNDED", "CANCELLED"];

// Order capabilities ----------------------------------------------------------
//
// What the buyer or seller looking at an order may do to it right now, and why
// not when they can't. The order page shows only the steps allowed here, and
// the order service refuses any step not allowed here, so the two can't drift.
// Admin and system steps (resolving disputes, auto-completion) don't go
// through this; the state machine above still guards every status change.

/** One thing a buyer or seller can do to an order. */
export const STEPS = [
  "pay",
  "ship",
  "cancel",
  "confirmDelivery",
  "accept",
  "requestReturn",
  "respondToReturn",
  "shipReturn",
  "receiveReturn",
  "review",
  "reportProblem",
] as const;
export type Step = (typeof STEPS)[number];

/** Why a step isn't allowed: the code of the message the person is shown. */
export type StepRefusal =
  | { allowed: false; reason: "invalidTransition"; to: OrderStatus }
  | {
      allowed: false;
      reason:
        | "orderNotFound"
        | "alreadyPaid"
        | "cancelBeforeShip"
        | "returnWindowClosed"
        | "returnAlreadyRequested"
        | "noPendingReturn"
        | "returnNotAwaitingShipment"
        | "returnNotShippedBack"
        | "disputeAlreadyOpen"
        | "disputeNotAllowed"
        | "reviewAfterCompletion"
        | "alreadyReviewed";
    };
export type StepCheck = { allowed: true } | StepRefusal;

/** What the rules need to know about an order. */
export type OrderFacts = {
  status: string;
  deliveredAt: Date | null;
  returnWindowDays: number;
  totalIdr: number;
  platformFeeIdr: number;
  refundIdr: number;
  returnRequest: { status: string } | null;
  dispute: object | null;
  review: object | null;
};

export type OrderCapabilities = {
  steps: Record<Step, StepCheck>;
  /** Reporting a problem may say the item never arrived (only before delivery). */
  notReceivedAllowed: boolean;
  /** Whole days left to ask for a return, counted from delivery; 0 before delivery or once it's over. */
  returnDaysLeft: number;
  /** What the seller is paid for this order: total, less ReGear's fee and any refund. */
  sellerPayoutIdr: number;
};

const DAY_MS = 86_400_000;
const ok: StepCheck = { allowed: true };
const no = (reason: Exclude<StepRefusal["reason"], "invalidTransition">): StepCheck => ({ allowed: false, reason });
const notNow = (to: OrderStatus): StepCheck => ({ allowed: false, reason: "invalidTransition", to });

/** The seller's share of an order. Also what their balance is credited when it completes. */
export function sellerPayoutIdr(order: { totalIdr: number; platformFeeIdr: number; refundIdr: number }) {
  return order.totalIdr - order.platformFeeIdr - order.refundIdr;
}

export function orderCapabilities(order: OrderFacts, viewer: "BUYER" | "SELLER" | "ADMIN", now = new Date()): OrderCapabilities {
  const s = order.status;
  const buyer = viewer === "BUYER";
  const seller = viewer === "SELLER";
  const party = buyer || seller;
  const returnStatus = order.returnRequest?.status;
  const returnEndsAt = order.deliveredAt ? order.deliveredAt.getTime() + order.returnWindowDays * DAY_MS : null;
  const withinReturnWindow = s === "DELIVERED" && returnEndsAt !== null && order.returnWindowDays > 0 && now.getTime() <= returnEndsAt;

  // Each step is the buyer's or the seller's; the other party (or anyone else)
  // gets the same answer as for an order that isn't theirs.
  const forBuyer = (check: () => StepCheck) => (buyer ? check() : no("orderNotFound"));
  const forSeller = (check: () => StepCheck) => (seller ? check() : no("orderNotFound"));

  const steps: Record<Step, StepCheck> = {
    pay: forBuyer(() => (s === "PENDING_PAYMENT" ? ok : no("alreadyPaid"))),
    ship: forSeller(() => (s === "PAID" ? ok : notNow("SHIPPED"))),
    cancel: party ? (s === "PENDING_PAYMENT" || s === "PAID" ? ok : no("cancelBeforeShip")) : no("orderNotFound"),
    // Only a shipment can be delivered. (A rejected return also moves to DELIVERED, but that's the seller's answer, not this step.)
    confirmDelivery: forBuyer(() => (s === "SHIPPED" ? ok : notNow("DELIVERED"))),
    // A disputed order is settled by an admin, not by the buyer accepting it.
    accept: forBuyer(() => (s === "DELIVERED" ? ok : notNow("COMPLETED"))),
    requestReturn: forBuyer(() => (!withinReturnWindow ? no("returnWindowClosed") : order.returnRequest ? no("returnAlreadyRequested") : ok)),
    // While a dispute is open, ReGear settles it; the seller can't answer the return meanwhile.
    respondToReturn: forSeller(() => (s === "RETURN_IN_PROGRESS" && returnStatus === "REQUESTED" ? ok : no("noPendingReturn"))),
    shipReturn: forBuyer(() => (s === "RETURN_IN_PROGRESS" && returnStatus === "APPROVED" ? ok : no("returnNotAwaitingShipment"))),
    receiveReturn: forSeller(() => (s === "RETURN_IN_PROGRESS" && returnStatus === "SHIPPED_BACK" ? ok : no("returnNotShippedBack"))),
    review: forBuyer(() => (s !== "COMPLETED" ? no("reviewAfterCompletion") : order.review ? no("alreadyReviewed") : ok)),
    reportProblem: !party
      ? no("orderNotFound")
      : order.dispute
        ? no("disputeAlreadyOpen")
        : canTransition(s, "DISPUTED")
          ? ok
          : no("disputeNotAllowed"),
  };

  return {
    steps,
    notReceivedAllowed: s === "PAID" || s === "SHIPPED",
    returnDaysLeft: returnEndsAt === null ? 0 : Math.max(0, Math.ceil((returnEndsAt - now.getTime()) / DAY_MS)),
    sellerPayoutIdr: sellerPayoutIdr(order),
  };
}

export function calculateFees(priceIdr: number, shippingIdr: number, feeBps: number) {
  const platformFeeIdr = Math.round((priceIdr * feeBps) / 10_000);
  return {
    platformFeeIdr,
    totalIdr: priceIdr + shippingIdr,
    sellerPayoutIdr: priceIdr + shippingIdr - platformFeeIdr,
  };
}

/** Human-friendly unique-ish order number, e.g. RG-LZ3K9F-7Q2M. */
export function generateOrderNumber(now = Date.now(), rand: () => number = Math.random): string {
  const ts = now.toString(36).toUpperCase().slice(-6);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(rand() * chars.length)];
  return `RG-${ts}-${suffix}`;
}
