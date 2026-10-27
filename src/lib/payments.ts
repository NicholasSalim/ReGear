import "server-only";
import { randomBytes } from "node:crypto";

// Payment provider abstraction. ReGear holds buyer funds in escrow from
// payment until the order completes (or is refunded). The simulated provider
// lets the full flow run locally; replace with a Stripe/Adyen/Xendit adapter
// (PaymentIntent with manual capture + webhook verification) in production.
//
// Every call carries an idempotency key naming the one money movement it is
// (e.g. "order:<id>:refund"). Provider calls happen before the order's status
// change is committed, so two racing requests (a double click, buyer and
// seller cancelling at once) both reach the provider; the key makes the
// provider perform the movement once and answer both with the same result.
// Adapters must pass it through (Stripe: the Idempotency-Key header).

export type IdempotencyKey = string;

export interface PaymentProvider {
  charge(input: { idempotencyKey: IdempotencyKey; orderId: string; amountIdr: number; currency: string }): Promise<{ ref: string }>;
  refund(input: { idempotencyKey: IdempotencyKey; ref: string; amountIdr: number }): Promise<{ ref: string }>;
  payout(input: { idempotencyKey: IdempotencyKey; orderId: string; amountIdr: number; sellerId: string }): Promise<{ ref: string }>;
}

/** The one key for each money movement of an order. */
export const paymentKey = (orderId: string, movement: "charge" | "refund" | "payout") => `order:${orderId}:${movement}`;

// Simulated provider: like a real one, it answers a repeated key with the
// first result, and refuses a repeated key asking for a different amount.
const seen = new Map<IdempotencyKey, { ref: string; amountIdr: number }>();
function once(prefix: string, key: IdempotencyKey, amountIdr: number) {
  let result = seen.get(key);
  if (!result) {
    result = { ref: `${prefix}_${randomBytes(10).toString("hex")}`, amountIdr };
    seen.set(key, result);
  }
  if (result.amountIdr !== amountIdr) throw new Error(`Idempotency key ${key} was used with a different amount`);
  return { ref: result.ref };
}

const simulated: PaymentProvider = {
  async charge({ idempotencyKey, amountIdr }) {
    return once("sim_ch", idempotencyKey, amountIdr);
  },
  async refund({ idempotencyKey, amountIdr }) {
    return once("sim_re", idempotencyKey, amountIdr);
  },
  async payout({ idempotencyKey, amountIdr }) {
    return once("sim_po", idempotencyKey, amountIdr);
  },
};

export const payments: PaymentProvider = simulated;
