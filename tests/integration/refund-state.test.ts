import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { refundState } = await import("@/lib/orders/refunds");

const sentAt = new Date("2026-11-05T10:00:00Z");
const account = { refundBank: "bca", refundAccountNumber: "1234567890", refundAccountName: "Buyer" };
const noAccount = { refundBank: null, refundAccountNumber: null, refundAccountName: null };
const facts = (over: Partial<Parameters<typeof refundState>[0]>) => ({
  refundIdr: 50_000,
  refundedAt: null,
  paymentMethod: "qris",
  ...noAccount,
  ...over,
});

describe("refund state", () => {
  it.each([
    ["no refund", facts({ refundIdr: 0 }), { kind: "none" }],
    ["through the provider, not confirmed yet", facts({}), { kind: "onItsWay", amountIdr: 50_000 }],
    // Older orders don't know how they were paid until the refund looks it up; until then it goes to the provider.
    ["payment method not known yet", facts({ paymentMethod: null }), { kind: "onItsWay", amountIdr: 50_000 }],
    ["through the provider, confirmed", facts({ refundedAt: sentAt }), { kind: "sent", amountIdr: 50_000, sentAt, byHand: false, account: null }],
    ["bank transfer, no account yet", facts({ paymentMethod: "bank_transfer" }), { kind: "needsAccount", amountIdr: 50_000 }],
    [
      "bank transfer, account given",
      facts({ paymentMethod: "echannel", ...account }),
      { kind: "awaitingTransfer", amountIdr: 50_000, account: { bank: "bca", accountNumber: "1234567890", accountName: "Buyer" } },
    ],
    [
      "bank transfer, sent by an admin",
      facts({ paymentMethod: "bank_transfer", refundedAt: sentAt, ...account }),
      { kind: "sent", amountIdr: 50_000, sentAt, byHand: true, account: { bank: "bca", accountNumber: "1234567890", accountName: "Buyer" } },
    ],
  ])("%s", (_name, order, expected) => {
    expect(refundState(order)).toEqual(expected);
  });
});
