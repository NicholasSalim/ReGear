import "server-only";
import { randomBytes } from "node:crypto";

// Payment provider abstraction. ReGear holds buyer funds in escrow from
// payment until the order completes (or is refunded). The simulated provider
// lets the full flow run locally; replace with a Stripe/Adyen/Xendit adapter
// (PaymentIntent with manual capture + webhook verification) in production.

export interface PaymentProvider {
  charge(input: { orderId: string; amountCents: number; currency: string }): Promise<{ ref: string }>;
  refund(input: { ref: string; amountCents: number }): Promise<{ ref: string }>;
  payout(input: { orderId: string; amountCents: number; sellerId: string }): Promise<{ ref: string }>;
}

const simulated: PaymentProvider = {
  async charge() {
    return { ref: `sim_ch_${randomBytes(10).toString("hex")}` };
  },
  async refund() {
    return { ref: `sim_re_${randomBytes(10).toString("hex")}` };
  },
  async payout() {
    return { ref: `sim_po_${randomBytes(10).toString("hex")}` };
  },
};

export const payments: PaymentProvider = simulated;
