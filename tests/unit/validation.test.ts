import { describe, expect, it } from "vitest";
import { getCategory } from "@/lib/catalog";
import { browseSchema, listingSchema, registerSchema } from "@/lib/validation";
import { safeRedirectPath } from "@/lib/security/request";

const phoneChecks = getCategory("phones")!.checks.map((c) => ({ key: c.key, status: "PASS" as const }));

const validListing = {
  title: "iPhone 13 128GB Midnight",
  category: "phones",
  brand: "Apple",
  model: "iPhone 13",
  description: "Well kept phone, used with a case and screen protector since day one.",
  priceCents: "499.99",
  originalPriceCents: null,
  shippingCents: "0",
  location: "Jakarta",
  conditionGrade: "EXCELLENT",
  warrantyType: "NONE",
  warrantyMonths: "0",
  warrantyTerms: "",
  returnWindowDays: "7",
  specs: { storage: "128", simLock: "Unlocked", unknownKey: "dropped" },
  batteryHealth: "88",
  cosmeticScore: "9",
  checks: phoneChecks,
  includedAccessories: ["Cable"],
  knownIssues: "",
  serialVerified: true,
  originalBox: false,
  imageIds: ["clx0000000000000000000000"],
  publish: true,
};

describe("listing validation", () => {
  it("accepts a complete listing and normalises values", () => {
    const res = listingSchema.safeParse(validListing);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.priceCents).toBe(49_999);
    expect(res.data.specs).toMatchObject({ storage: 128, simLock: "Unlocked", dualSim: false });
    expect(res.data.specs).not.toHaveProperty("unknownKey");
  });

  it("requires category-specific spec fields", () => {
    const res = listingSchema.safeParse({ ...validListing, specs: {} });
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path.join(".") === "specs.storage")).toBe(true);
  });

  it("requires every checklist item to be rated", () => {
    const res = listingSchema.safeParse({ ...validListing, checks: phoneChecks.slice(1) });
    expect(res.success).toBe(false);
  });

  it("blocks Like New grading when a check failed", () => {
    const checks = phoneChecks.map((c, i) => (i === 0 ? { ...c, status: "FAIL" as const, note: "Dead pixels" } : c));
    const res = listingSchema.safeParse({ ...validListing, conditionGrade: "LIKE_NEW", checks });
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path[0] === "conditionGrade")).toBe(true);
  });

  it("requires notes on issues and battery health for battery devices", () => {
    const checks = phoneChecks.map((c, i) => (i === 0 ? { ...c, status: "MINOR" as const } : c));
    expect(listingSchema.safeParse({ ...validListing, checks }).success).toBe(false);
    expect(listingSchema.safeParse({ ...validListing, batteryHealth: null }).success).toBe(false);
  });

  it("rejects control characters and oversize input", () => {
    expect(listingSchema.safeParse({ ...validListing, title: "Bad\u0000title here" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...validListing, description: "x".repeat(6000) }).success).toBe(false);
  });
});

describe("auth validation", () => {
  it("normalises email and enforces password policy", () => {
    const ok = registerSchema.safeParse({ name: "Ann", email: "  Ann@Example.COM ", password: "longpassword1" });
    expect(ok.success && ok.data.email).toBe("ann@example.com");
    expect(registerSchema.safeParse({ name: "Ann", email: "ann@example.com", password: "short1" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "Ann", email: "ann@example.com", password: "nodigitsatall" }).success).toBe(false);
  });
});

describe("browse params", () => {
  it("falls back safely on garbage input", () => {
    const p = browseSchema.parse({ category: "<script>", sort: "drop table", page: "-4", grade: ["GOOD", "NOPE"], min: "abc" });
    expect(p.category).toBeUndefined();
    expect(p.sort).toBe("newest");
    expect(p.page).toBe(1);
    expect(p.min).toBeUndefined();
  });
});

describe("redirect safety", () => {
  it("only allows same-site relative paths", () => {
    expect(safeRedirectPath("/account")).toBe("/account");
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath(undefined, "/x")).toBe("/x");
  });
});
