import { describe, expect, it } from "vitest";
import { batteryLabel, functionalScore } from "@/lib/condition";
import { calculateFees, canTransition, generateOrderNumber, orderCapabilities, STEPS, type OrderFacts, type Step } from "@/lib/orders/state";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { serializeJsonLd } from "@/components/json-ld";
import { formatSpecValue, getCategory } from "@/lib/catalog";

describe("order state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("PENDING_PAYMENT", "PAID")).toBe(true);
    expect(canTransition("PAID", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransition("DELIVERED", "COMPLETED")).toBe(true);
  });

  it("rejects illegal jumps and changes to terminal states", () => {
    expect(canTransition("PENDING_PAYMENT", "SHIPPED")).toBe(false);
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(false);
    expect(canTransition("COMPLETED", "REFUNDED")).toBe(false);
    expect(canTransition("CANCELLED", "PAID")).toBe(false);
    expect(canTransition("NOT_A_STATUS", "PAID")).toBe(false);
  });

  it("calculates fees in integer cents", () => {
    expect(calculateFees(99_999, 900, 500)).toEqual({ platformFeeIdr: 5000, totalIdr: 100_899, sellerPayoutIdr: 95_899 });
  });

  it("generates readable order numbers", () => {
    expect(generateOrderNumber(1_700_000_000_000, () => 0)).toMatch(/^RG-[A-Z0-9]{6}-AAAA$/);
  });
});

describe("order capabilities", () => {
  const deliveredAt = new Date("2026-01-01T00:00:00Z");
  const now = new Date("2026-01-03T00:00:00Z");
  const order = (over: Partial<OrderFacts> = {}): OrderFacts => ({
    status: "PENDING_PAYMENT",
    deliveredAt: null,
    returnWindowDays: 7,
    totalIdr: 100_000,
    platformFeeIdr: 5_000,
    refundIdr: 0,
    returnRequest: null,
    dispute: null,
    review: null,
    ...over,
  });
  const allowed = (o: OrderFacts, viewer: "BUYER" | "SELLER" | "ADMIN", at = now) =>
    STEPS.filter((step) => orderCapabilities(o, viewer, at).steps[step].allowed);
  const reason = (o: OrderFacts, viewer: "BUYER" | "SELLER", step: Step, at = now) => {
    const check = orderCapabilities(o, viewer, at).steps[step];
    return check.allowed ? null : check.reason;
  };

  // Who may do what at each point of an order's life.
  it.each<[string, Partial<OrderFacts>, Step[], Step[]]>([
    ["unpaid", {}, ["pay", "cancel"], ["cancel"]],
    ["paid", { status: "PAID" }, ["cancel", "reportProblem"], ["ship", "cancel", "reportProblem"]],
    ["shipped", { status: "SHIPPED" }, ["confirmDelivery", "reportProblem"], ["reportProblem"]],
    ["delivered, in the return window", { status: "DELIVERED", deliveredAt }, ["accept", "requestReturn", "reportProblem"], ["reportProblem"]],
    ["return requested", { status: "RETURN_IN_PROGRESS", deliveredAt, returnRequest: { status: "REQUESTED" } }, ["reportProblem"], ["respondToReturn", "reportProblem"]],
    ["return approved", { status: "RETURN_IN_PROGRESS", deliveredAt, returnRequest: { status: "APPROVED" } }, ["shipReturn", "reportProblem"], ["reportProblem"]],
    ["return shipped back", { status: "RETURN_IN_PROGRESS", deliveredAt, returnRequest: { status: "SHIPPED_BACK" } }, ["reportProblem"], ["receiveReturn", "reportProblem"]],
    ["disputed", { status: "DISPUTED", dispute: {} }, [], []],
    ["completed", { status: "COMPLETED" }, ["review"], []],
    ["completed and reviewed", { status: "COMPLETED", review: {} }, [], []],
    ["refunded", { status: "REFUNDED" }, [], []],
    ["cancelled", { status: "CANCELLED" }, [], []],
  ])("%s", (_name, over, buyerSteps, sellerSteps) => {
    expect(allowed(order(over), "BUYER")).toEqual(buyerSteps);
    expect(allowed(order(over), "SELLER")).toEqual(sellerSteps);
    expect(allowed(order(over), "ADMIN")).toEqual([]);
  });

  it("closes the return window at its end, and never opens one of 0 days", () => {
    const delivered = order({ status: "DELIVERED", deliveredAt });
    expect(reason(delivered, "BUYER", "requestReturn", new Date("2026-01-07T23:00:00Z"))).toBeNull();
    expect(reason(delivered, "BUYER", "requestReturn", new Date("2026-01-08T01:00:00Z"))).toBe("returnWindowClosed");
    expect(reason(order({ status: "DELIVERED", deliveredAt, returnWindowDays: 0 }), "BUYER", "requestReturn", deliveredAt)).toBe("returnWindowClosed");
    expect(reason(order({ status: "DELIVERED", deliveredAt, returnRequest: { status: "REJECTED" } }), "BUYER", "requestReturn")).toBe("returnAlreadyRequested");
    expect(orderCapabilities(delivered, "BUYER", now).returnDaysLeft).toBe(5);
    expect(orderCapabilities(delivered, "BUYER", new Date("2026-02-01T00:00:00Z")).returnDaysLeft).toBe(0);
  });

  it("gives the reason a step is refused", () => {
    expect(reason(order({ status: "PAID" }), "BUYER", "pay")).toBe("alreadyPaid");
    expect(reason(order({ status: "SHIPPED" }), "SELLER", "cancel")).toBe("cancelBeforeShip");
    expect(orderCapabilities(order({ status: "DELIVERED" }), "SELLER").steps.ship).toEqual({ allowed: false, reason: "invalidTransition", to: "SHIPPED" });
    expect(reason(order({ status: "SHIPPED", dispute: {} }), "BUYER", "reportProblem")).toBe("disputeAlreadyOpen");
    expect(reason(order({ status: "PENDING_PAYMENT" }), "BUYER", "reportProblem")).toBe("disputeNotAllowed");
    // A step that belongs to the other party reads as an order that isn't yours.
    expect(reason(order(), "SELLER", "pay")).toBe("orderNotFound");
    // A return can't be answered while ReGear settles a dispute about it.
    expect(reason(order({ status: "DISPUTED", returnRequest: { status: "REQUESTED" }, dispute: {} }), "SELLER", "respondToReturn")).toBe("noPendingReturn");
  });

  it("offers 'not received' only before delivery, and works out the seller's payout", () => {
    expect(orderCapabilities(order({ status: "SHIPPED" }), "BUYER").notReceivedAllowed).toBe(true);
    expect(orderCapabilities(order({ status: "DELIVERED", deliveredAt }), "BUYER").notReceivedAllowed).toBe(false);
    expect(orderCapabilities(order({ refundIdr: 20_000 }), "SELLER").sellerPayoutIdr).toBe(75_000);
  });
});

describe("condition scoring", () => {
  it("weights minor issues at half and ignores N/A", () => {
    expect(
      functionalScore([
        { key: "a", status: "PASS" },
        { key: "b", status: "MINOR" },
        { key: "c", status: "FAIL" },
        { key: "d", status: "NA" },
      ]),
    ).toBe(50);
    expect(functionalScore([])).toBe(100);
  });

  it("labels battery health", () => {
    expect(batteryLabel(95)?.level).toBe("excellent");
    expect(batteryLabel(65)?.level).toBe("service");
    expect(batteryLabel(null)).toBeNull();
  });

  it("formats storage specs", () => {
    const field = getCategory("phones")!.specFields.find((f) => f.key === "storage");
    expect(formatSpecValue(field, 2048, "en")).toBe("2 TB");
    expect(formatSpecValue(field, 256, "en")).toBe("256 GB");
    expect(formatSpecValue(undefined, true, "en")).toBe("Yes");
    expect(formatSpecValue(undefined, true, "id")).toBe("Ya");
  });

  it("translates select options but keeps the stored value", () => {
    const usage = getCategory("pc-components")!.specFields.find((f) => f.key === "usage");
    expect(formatSpecValue(usage, "Mining", "id")).toBe("Penambangan kripto");
    expect(formatSpecValue(usage, "Mining", "en")).toBe("Mining");
    expect(formatSpecValue(usage, "Workstation", "id")).toBe("Workstation");
  });
});

describe("password hashing", () => {
  it("verifies correct passwords and rejects wrong ones", async () => {
    const hash = await hashPassword("correct horse 1");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect((await verifyPassword("correct horse 1", hash)).ok).toBe(true);
    expect((await verifyPassword("correct horse 2", hash)).ok).toBe(false);
    expect((await verifyPassword("x", "garbage")).ok).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });
});

describe("JSON-LD serialisation", () => {
  it("cannot break out of the script element", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});
