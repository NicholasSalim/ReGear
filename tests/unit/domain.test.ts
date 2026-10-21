import { describe, expect, it } from "vitest";
import { batteryLabel, functionalScore } from "@/lib/condition";
import { calculateFees, canOpenDispute, canTransition, generateOrderNumber, isWithinReturnWindow } from "@/lib/orders/state";
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

  it("only allows disputes once money is in escrow", () => {
    expect(canOpenDispute({ status: "PENDING_PAYMENT" })).toBe(false);
    expect(canOpenDispute({ status: "SHIPPED" })).toBe(true);
    expect(canOpenDispute({ status: "COMPLETED" })).toBe(false);
  });

  it("enforces the return window", () => {
    const deliveredAt = new Date("2026-01-01T00:00:00Z");
    const order = { status: "DELIVERED", deliveredAt, returnWindowDays: 7 };
    expect(isWithinReturnWindow(order, new Date("2026-01-07T23:00:00Z"))).toBe(true);
    expect(isWithinReturnWindow(order, new Date("2026-01-08T01:00:00Z"))).toBe(false);
    expect(isWithinReturnWindow({ ...order, returnWindowDays: 0 }, deliveredAt)).toBe(false);
    expect(isWithinReturnWindow({ ...order, status: "SHIPPED" }, deliveredAt)).toBe(false);
  });

  it("calculates fees in integer cents", () => {
    expect(calculateFees(99_999, 900, 500)).toEqual({ platformFeeIdr: 5000, totalIdr: 100_899, sellerPayoutIdr: 95_899 });
  });

  it("generates readable order numbers", () => {
    expect(generateOrderNumber(1_700_000_000_000, () => 0)).toMatch(/^RG-[A-Z0-9]{6}-AAAA$/);
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
    expect(batteryLabel(95)?.label).toBe("Excellent");
    expect(batteryLabel(65)?.label).toBe("Service recommended");
    expect(batteryLabel(null)).toBeNull();
  });

  it("formats storage specs", () => {
    const field = getCategory("phones")!.specFields.find((f) => f.key === "storage");
    expect(formatSpecValue(field, 2048)).toBe("2 TB");
    expect(formatSpecValue(field, 256)).toBe("256 GB");
    expect(formatSpecValue(undefined, true)).toBe("Yes");
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
