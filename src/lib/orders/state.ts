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

/** Whether the buyer may still request a return. */
export function isWithinReturnWindow(
  order: { status: string; deliveredAt: Date | null; returnWindowDays: number },
  now = new Date(),
): boolean {
  if (order.status !== "DELIVERED" || !order.deliveredAt || order.returnWindowDays <= 0) return false;
  const deadline = order.deliveredAt.getTime() + order.returnWindowDays * 86_400_000;
  return now.getTime() <= deadline;
}

export function canOpenDispute(order: { status: string }): boolean {
  return canTransition(order.status, "DISPUTED");
}

export function calculateFees(priceCents: number, shippingCents: number, feeBps: number) {
  const platformFeeCents = Math.round((priceCents * feeBps) / 10_000);
  return {
    platformFeeCents,
    totalCents: priceCents + shippingCents,
    sellerPayoutCents: priceCents + shippingCents - platformFeeCents,
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
