import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, PaymentState } from "@/lib/payments";

// Midtrans adapter: Snap (hosted payment page) to take payments, Core API for
// status, expiry and refunds. Midtrans's order_id is our order id. Snap will
// open more than one page for an unpaid order_id, but an order_id carries at
// most one payment, which is what makes a charge happen once.

const HOSTS = {
  sandbox: { snap: "https://app.sandbox.midtrans.com", api: "https://api.sandbox.midtrans.com" },
  production: { snap: "https://app.midtrans.com", api: "https://api.midtrans.com" },
} as const;

// Only methods Midtrans can refund through its API. Escrow depends on
// refunds (cancellations, returns, disputes); bank transfers and convenience
// stores would need a manual refund. ShopeePay can't refund part of a payment,
// so a partial dispute refund on a ShopeePay order needs handling by hand.
const ENABLED_PAYMENTS = ["gopay", "shopeepay", "other_qris"];

export class MidtransError extends Error {
  constructor(
    message: string,
    readonly statusCode?: string,
  ) {
    super(message);
    this.name = "MidtransError";
  }
}

type Body = Record<string, unknown>;

/** A notification is genuine when its signature was made with our server key. */
export function verifyMidtransSignature(n: Body, serverKey: string) {
  const { order_id, status_code, gross_amount, signature_key } = n;
  if (typeof signature_key !== "string") return false;
  const expected = createHash("sha512").update(`${order_id}${status_code}${gross_amount}${serverKey}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature_key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "2026-10-27 10:00:00 +0700": the format Snap's expiry.start_time takes, in Jakarta time. */
function jakartaTime(d: Date) {
  return `${new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", " ")} +0700`;
}

function toState(b: Body): PaymentState {
  const code = String(b.status_code ?? "");
  if (code === "404") return { state: "none" }; // the buyer hasn't picked a payment method yet
  const status = String(b.transaction_status ?? "").toLowerCase();
  const fraud = String(b.fraud_status ?? "accept").toLowerCase();
  // Refunded transactions were paid first; the refund is ours and already recorded.
  if (status === "settlement" || (status === "capture" && fraud === "accept") || status === "refund" || status === "partial_refund") {
    return { state: "paid", ref: String(b.transaction_id), amountIdr: Math.round(Number(b.gross_amount)) };
  }
  if (status === "pending" || status === "authorize" || status === "capture") return { state: "pending" };
  if (status === "expire" || status === "cancel" || status === "deny" || status === "failure") return { state: "failed" };
  throw new MidtransError(`Unexpected Midtrans status ${code} "${status}"`, code);
}

export function createMidtrans(serverKey: string, environment: keyof typeof HOSTS): PaymentProvider {
  const hosts = HOSTS[environment];
  const auth = `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;

  async function call(url: string, body?: Body): Promise<{ http: number; body: Body }> {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: auth },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return { http: res.status, body: ((await res.json().catch(() => ({}))) ?? {}) as Body };
  }
  const core = (orderId: string, path: string, body?: Body) =>
    call(`${hosts.api}/v2/${encodeURIComponent(orderId)}/${path}`, body).then((r) => r.body);

  async function status(orderId: string) {
    return toState(await core(orderId, "status"));
  }

  return {
    mode: environment === "sandbox" ? "sandbox" : "live",

    async checkout({ orderId, amountIdr, expiresAt, itemName, returnUrl }) {
      const minutes = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 60_000));
      const { http, body } = await call(`${hosts.snap}/snap/v1/transactions`, {
        transaction_details: { order_id: orderId, gross_amount: amountIdr },
        item_details: [{ id: orderId, price: amountIdr, quantity: 1, name: itemName.slice(0, 50) }],
        enabled_payments: ENABLED_PAYMENTS,
        callbacks: { finish: returnUrl },
        // Both the page and the payment itself close when our hold on the item ends.
        expiry: { start_time: jakartaTime(new Date()), unit: "minutes", duration: minutes },
        page_expiry: { unit: "minutes", duration: minutes },
      });
      if (http !== 201 || typeof body.redirect_url !== "string") {
        throw new MidtransError(`Snap rejected order ${orderId}: ${http} ${JSON.stringify(body.error_messages ?? body)}`, String(http));
      }
      return { redirectUrl: body.redirect_url };
    },

    status,

    async abandon(orderId) {
      const before = await status(orderId);
      if (before.state !== "pending") return before;
      // 407 means expired. Anything else most likely means it was paid in the
      // meantime; the status answers either way.
      await core(orderId, "expire", {});
      return status(orderId);
    },

    async refund({ idempotencyKey, orderId, amountIdr }) {
      // Midtrans refund keys allow only letters, digits, "-" and "_".
      const refundKey = idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "-");
      const b = await core(orderId, "refund", { refund_key: refundKey, amount: amountIdr, reason: "ReGear order refund" });
      // 406 "Duplicate refund ID": an earlier attempt with this key already went through.
      if (b.status_code === "200" || b.status_code === "406") return { ref: refundKey };
      throw new MidtransError(`Refund of order ${orderId} failed: ${b.status_code} ${b.status_message}`, String(b.status_code));
    },
  };
}
