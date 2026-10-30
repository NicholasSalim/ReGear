import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMidtrans, verifyMidtransSignature } from "@/lib/midtrans";

const KEY = "SB-Mid-server-test-key";
const midtrans = createMidtrans(KEY, "sandbox");

/** Answer each fetch with the next response, and keep the requests. */
function respond(...replies: { status?: number; body: Record<string, unknown> }[]) {
  const fetch = vi.fn(async () => {
    const r = replies.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const request = (fetch: ReturnType<typeof respond>, i = 0) => {
  const [url, init] = fetch.mock.calls[i] as unknown as [string, RequestInit];
  return { url, init, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

afterEach(() => vi.unstubAllGlobals());

describe("Midtrans notification signature", () => {
  const n = { order_id: "cm123", status_code: "200", gross_amount: "10500.00" };
  const sign = (key: string) => createHash("sha512").update(`cm123200${n.gross_amount}${key}`).digest("hex");

  it("accepts a notification signed with our server key", () => {
    expect(verifyMidtransSignature({ ...n, signature_key: sign(KEY) }, KEY)).toBe(true);
  });

  it("rejects a forged, altered or unsigned notification", () => {
    expect(verifyMidtransSignature({ ...n, signature_key: sign("someone-else") }, KEY)).toBe(false);
    expect(verifyMidtransSignature({ ...n, gross_amount: "1.00", signature_key: sign(KEY) }, KEY)).toBe(false);
    expect(verifyMidtransSignature(n, KEY)).toBe(false);
  });
});

describe("Midtrans adapter", () => {
  it("creates a Snap page that closes with the hold on the item", async () => {
    const fetch = respond({ status: 201, body: { token: "t", redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/t" } });
    const res = await midtrans.checkout({
      idempotencyKey: "order:cm1:charge",
      orderId: "cm1",
      amountIdr: 10_500,
      currency: "IDR",
      expiresAt: new Date(Date.now() + 30 * 60_000),
      itemName: "x".repeat(80),
      returnUrl: "https://regear.example/api/payments/return?order=cm1",
    });
    expect(res).toEqual({ redirectUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/t" });
    const { url, init, body } = request(fetch);
    expect(url).toBe("https://app.sandbox.midtrans.com/snap/v1/transactions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${KEY}:`).toString("base64")}`);
    expect(body.transaction_details).toEqual({ order_id: "cm1", gross_amount: 10_500 });
    expect(body.item_details[0].name).toHaveLength(50);
    expect(body.expiry).toMatchObject({ unit: "minutes", duration: 29 });
    expect(body.expiry.start_time).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \+0700$/);
  });

  it("keeps the page open at least the 5 minutes Snap requires", async () => {
    const fetch = respond({ status: 201, body: { token: "t", redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/t" } });
    await midtrans.checkout({ idempotencyKey: "k", orderId: "cm1", amountIdr: 1, currency: "IDR", expiresAt: new Date(Date.now() + 2 * 60_000), itemName: "x", returnUrl: "https://x" });
    expect(request(fetch).body).toMatchObject({ expiry: { duration: 5 }, page_expiry: { duration: 5 } });
  });

  it("fails loudly when Snap refuses", async () => {
    respond({ status: 400, body: { error_messages: ["transaction_details.order_id sudah digunakan"] } });
    await expect(midtrans.checkout({ idempotencyKey: "k", orderId: "cm1", amountIdr: 1, currency: "IDR", expiresAt: new Date(), itemName: "x", returnUrl: "https://x" })).rejects.toThrow(/sudah digunakan/);
  });

  it("reads the transaction status", async () => {
    respond(
      { body: { status_code: "404", status_message: "Transaction doesn't exist." } },
      { body: { status_code: "201", transaction_status: "pending" } },
      { body: { status_code: "200", transaction_status: "settlement", transaction_id: "tx-1", gross_amount: "10500.00" } },
      { body: { status_code: "200", transaction_status: "capture", fraud_status: "challenge", transaction_id: "tx-1", gross_amount: "10500.00" } },
      { body: { status_code: "407", transaction_status: "expire" } },
    );
    expect(await midtrans.status("cm1")).toEqual({ state: "none" });
    expect(await midtrans.status("cm1")).toEqual({ state: "pending" });
    expect(await midtrans.status("cm1")).toEqual({ state: "paid", ref: "tx-1", amountIdr: 10_500 });
    expect(await midtrans.status("cm1")).toEqual({ state: "pending" }); // held for fraud review
    expect(await midtrans.status("cm1")).toEqual({ state: "failed" });
  });

  it("expires a pending payment and reports what happened", async () => {
    const fetch = respond(
      { body: { status_code: "201", transaction_status: "pending" } },
      { body: { status_code: "407", transaction_status: "expire" } },
      { body: { status_code: "407", transaction_status: "expire" } },
    );
    expect(await midtrans.abandon("cm1")).toEqual({ state: "failed" });
    expect(request(fetch, 1)).toMatchObject({ url: "https://api.sandbox.midtrans.com/v2/cm1/expire", init: { method: "POST" } });
  });

  it("has nothing to refund for a demo order from the seed, in the sandbox only", async () => {
    const input = { idempotencyKey: "order:cm1:refund", orderId: "cm1", ref: "sim_ch_abc", amountIdr: 2_000 };
    const fetch = respond();
    expect(await midtrans.refund(input)).toEqual({ ref: "order-cm1-refund" });
    expect(fetch).not.toHaveBeenCalled();
    respond({ body: { status_code: "404" } });
    await expect(createMidtrans(KEY, "production").refund(input)).rejects.toThrow(/404/);
  });

  it("refunds with a key Midtrans accepts, and treats a repeated key as done", async () => {
    const fetch = respond({ body: { status_code: "200" } }, { body: { status_code: "406", status_message: "Duplicate refund ID" } }, { body: { status_code: "412" } });
    const input = { idempotencyKey: "order:cm1:refund", orderId: "cm1", ref: "tx-1", amountIdr: 2_000 };
    expect(await midtrans.refund(input)).toEqual({ ref: "order-cm1-refund" });
    expect(request(fetch).body).toMatchObject({ refund_key: "order-cm1-refund", amount: 2_000 });
    expect(await midtrans.refund(input)).toEqual({ ref: "order-cm1-refund" });
    await expect(midtrans.refund(input)).rejects.toThrow(/412/);
  });
});
