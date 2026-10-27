import "server-only";
import { randomBytes } from "node:crypto";
import { env, isProd } from "@/lib/env";

// Payout provider: how a seller's withdrawal reaches their bank account.
// Production pays by hand: every withdrawal waits in Admin → Payouts for an
// admin to transfer the money and mark it paid (PAYOUTS_MODE=manual does the
// same anywhere). Development and tests simulate the transfer. An automatic
// provider (a disbursement API) would implement this same interface.

export type PayoutStatus = "processing" | "completed" | "failed";

/** The provider didn't take the payout. Nothing is retried automatically. */
export class PayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutError";
  }
}

export interface PayoutProvider {
  readonly mode: "simulated" | "manual";
  /** Hand the payout over; it completes later (see status). */
  send(input: { withdrawalId: string; bank: string; account: string; name: string; amountIdr: number }): Promise<{ reference: string }>;
  status(reference: string): Promise<PayoutStatus>;
}

/** Banks sellers can be paid at. */
export const BANKS = [
  { code: "bca", name: "BCA" },
  { code: "bni", name: "BNI" },
  { code: "bri", name: "BRI" },
  { code: "btn", name: "BTN" },
  { code: "bsi", name: "BSI" },
  { code: "cimb", name: "CIMB Niaga" },
  { code: "danamon", name: "Danamon" },
  { code: "mandiri", name: "Mandiri" },
  { code: "permata", name: "Permata" },
] as const;

export const bankName = (code: string) => BANKS.find((b) => b.code === code)?.name ?? code.toUpperCase();

const simulated: PayoutProvider = {
  mode: "simulated",
  async send() {
    return { reference: `sim_po_${randomBytes(10).toString("hex")}` };
  },
  async status() {
    return "completed";
  },
};

// Never asked to send (see sendWithdrawal): an admin makes the transfer.
const manual: PayoutProvider = {
  mode: "manual",
  async send() {
    throw new PayoutError("Payouts are made by hand");
  },
  async status() {
    return "processing";
  },
};

export const payouts: PayoutProvider = env.PAYOUTS_MODE === "manual" || isProd ? manual : simulated;
