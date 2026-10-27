import "server-only";
import { randomBytes } from "node:crypto";
import { env, isProd } from "@/lib/env";
import { createMidtrans } from "@/lib/midtrans";

// Payment provider abstraction. ReGear holds buyer funds in escrow from
// payment until the order completes (or is refunded). Midtrans is used when
// MIDTRANS_SERVER_KEY is set; otherwise development and tests use the
// simulated provider, which pays instantly.
//
// A real provider takes payment on its own page: checkout returns a URL to
// send the buyer to, and the order only becomes PAID once the provider's
// status API says so (see syncPayment in the order service).
//
// Every money movement carries an idempotency key naming the one movement it
// is (e.g. "order:<id>:refund"). Provider calls happen before the order's
// status change is committed, so two racing requests (a double click, buyer
// and seller cancelling at once) both reach the provider; the key makes the
// provider perform the movement once.

export type IdempotencyKey = string;

export type PaymentState =
  | { state: "none" } // no payment started yet
  | { state: "pending" }
  | { state: "paid"; ref: string; amountIdr: number }
  | { state: "failed" }; // expired, cancelled or declined: this order can no longer be paid

export interface PaymentProvider {
  /** "simulated" pays instantly; "sandbox" is a real provider moving test money. */
  readonly mode: "simulated" | "sandbox" | "live";
  checkout(input: {
    idempotencyKey: IdempotencyKey;
    orderId: string;
    amountIdr: number;
    currency: string;
    expiresAt: Date;
    itemName: string;
    returnUrl: string;
  }): Promise<{ redirectUrl: string } | { paid: { ref: string } }>;
  status(orderId: string): Promise<PaymentState>;
  /** Stop a payment that hasn't happened yet so it can't happen later; returns the final state (it may have just been paid). */
  abandon(orderId: string): Promise<PaymentState>;
  refund(input: { idempotencyKey: IdempotencyKey; orderId: string; ref: string; amountIdr: number }): Promise<{ ref: string }>;
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
  mode: "simulated",
  async checkout({ idempotencyKey, amountIdr }) {
    return { paid: once("sim_ch", idempotencyKey, amountIdr) };
  },
  async status() {
    return { state: "none" };
  },
  async abandon() {
    return { state: "none" };
  },
  async refund({ idempotencyKey, amountIdr }) {
    return once("sim_re", idempotencyKey, amountIdr);
  },
  async payout({ idempotencyKey, amountIdr }) {
    return once("sim_po", idempotencyKey, amountIdr);
  },
};

function notConfigured(): never {
  throw new Error("Payments are not configured: set MIDTRANS_SERVER_KEY");
}
// Production never falls back to fake money.
const unconfigured: PaymentProvider = {
  mode: "live",
  checkout: notConfigured,
  async status() {
    return { state: "none" };
  },
  async abandon() {
    return { state: "none" };
  },
  refund: notConfigured,
  payout: notConfigured,
};

export const payments: PaymentProvider = env.MIDTRANS_SERVER_KEY
  ? createMidtrans(env.MIDTRANS_SERVER_KEY, env.MIDTRANS_ENV)
  : isProd
    ? unconfigured
    : simulated;
