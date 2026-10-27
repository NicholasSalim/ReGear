import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { clientIpFromForwarded } = await import("@/lib/security/request");
const { paymentKey, payments } = await import("@/lib/payments");

describe("client IP from X-Forwarded-For", () => {
  it("takes the address our proxy saw, not one the client wrote", () => {
    // The client sent "X-Forwarded-For: 6.6.6.6"; our proxy appended the real address.
    expect(clientIpFromForwarded("6.6.6.6, 203.0.113.7", 1)).toBe("203.0.113.7");
    expect(clientIpFromForwarded("203.0.113.7", 1)).toBe("203.0.113.7");
  });

  it("skips one entry per extra trusted proxy", () => {
    // CDN appended the client, then the load balancer appended the CDN.
    expect(clientIpFromForwarded("6.6.6.6, 203.0.113.7, 10.0.0.2", 2)).toBe("203.0.113.7");
    expect(clientIpFromForwarded("203.0.113.7", 3)).toBe("203.0.113.7");
  });

  it("has nothing to offer for an empty header", () => {
    expect(clientIpFromForwarded(null, 1)).toBeNull();
    expect(clientIpFromForwarded(" , ", 1)).toBeNull();
  });
});

describe("simulated payments", () => {
  it("performs a movement once per idempotency key", async () => {
    const idempotencyKey = paymentKey("order-unit-1", "refund");
    const a = await payments.refund({ idempotencyKey, orderId: "order-unit-1", ref: "ch", amountIdr: 100 });
    const b = await payments.refund({ idempotencyKey, orderId: "order-unit-1", ref: "ch", amountIdr: 100 });
    expect(b.ref).toBe(a.ref);
    const other = await payments.refund({ idempotencyKey: paymentKey("order-unit-2", "refund"), orderId: "order-unit-2", ref: "ch", amountIdr: 100 });
    expect(other.ref).not.toBe(a.ref);
  });

  it("refuses a repeated key that asks for a different amount", async () => {
    const idempotencyKey = paymentKey("order-unit-3", "refund");
    await payments.refund({ idempotencyKey, orderId: "order-unit-3", ref: "ch", amountIdr: 2_500 });
    await expect(payments.refund({ idempotencyKey, orderId: "order-unit-3", ref: "ch", amountIdr: 9_000 })).rejects.toThrow(/different amount/);
  });
});
