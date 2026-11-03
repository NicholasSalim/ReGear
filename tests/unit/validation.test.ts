import { describe, expect, it } from "vitest";
import { getCategory } from "@/lib/catalog";
import { browseSchema, listingSchema, parseListing, parseRupiah, registerSchema, verificationSchema } from "@/lib/validation";
import { safeRedirectPath } from "@/lib/security/request";

const phoneChecks = getCategory("phones")!.checks.map((c) => ({ key: c.key, status: "PASS" as const }));

const validListing = {
  title: "iPhone 13 128GB Midnight",
  category: "phones",
  brand: "Apple",
  model: "iPhone 13",
  description: "Well kept phone, used with a case and screen protector since day one.",
  priceIdr: "7.999.000",
  originalPriceIdr: null,
  shippingIdr: "0",
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
    expect(res.data.priceIdr).toBe(7_999_000);
    expect(res.data.specs).toMatchObject({ storage: 128, simLock: "Unlocked", dualSim: false });
    expect(res.data.specs).not.toHaveProperty("unknownKey");
  });

  it("requires category-specific spec fields", () => {
    const res = listingSchema.safeParse({ ...validListing, specs: {} });
    expect(res.success).toBe(false);
    expect(res.error?.issues.some((i) => i.path.join(".") === "specs.storage")).toBe(true);
  });

  it("keeps only the checks the seller included, in catalogue order", () => {
    const res = listingSchema.safeParse({ ...validListing, checks: [phoneChecks[2], phoneChecks[0]] });
    expect(res.success && res.data.checks.map((c) => c.key)).toEqual([phoneChecks[0].key, phoneChecks[2].key]);
    expect(listingSchema.safeParse({ ...validListing, checks: [] }).success).toBe(false);
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
    const ok = registerSchema.safeParse({ name: "Ann", email: "  Ann@Example.COM ", password: "pass#word1", acceptTerms: "on" });
    expect(ok.success && ok.data.email).toBe("ann@example.com");
    const accepts = (password: string) => registerSchema.safeParse({ name: "Ann", email: "ann@example.com", password, acceptTerms: "on" }).success;
    expect(accepts("ab1!cdef")).toBe(true); // exactly 8
    expect(accepts("ab1!cde")).toBe(false); // too short
    expect(accepts("nodigits!here")).toBe(false);
    expect(accepts("12345678!")).toBe(false); // no letter
    expect(accepts("Password123")).toBe(false); // no symbol
    expect(accepts("pass word1")).toBe(false); // a space is not a symbol
  });

  it("requires agreeing to the Terms to register, and consent to send an ID", () => {
    const res = registerSchema.safeParse({ name: "Ann", email: "ann@example.com", password: "pass#word1" });
    expect(res.success).toBe(false);
    expect(res.error?.issues.map((i) => i.path.join("."))).toEqual(["acceptTerms"]);
    const id = { legalName: "Ann Lee", phone: "+62 000 0000 0000", address: "Jl. Contoh No. 10, Jakarta", idType: "NATIONAL_ID", idNumber: "0000000000001234" };
    expect(verificationSchema.safeParse(id).success).toBe(false);
    expect(verificationSchema.safeParse({ ...id, consent: "on" }).success).toBe(true);
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

  it("refuses targets a browser would turn into another site", () => {
    for (const t of ["/\t/evil.com", "/\n/evil.com", "/\r\n/evil.com", "/ /evil.com".replace(" ", "\u0000"), "/\\/evil.com", "\\evil.com", "/\\evil.com"]) {
      expect(safeRedirectPath(t), JSON.stringify(t)).toBe("/");
    }
    expect(safeRedirectPath("/en/account/orders/abc?pay=1#top")).toBe("/en/account/orders/abc?pay=1#top");
    expect(safeRedirectPath("/%2F/evil.com")).toBe("/%2F/evil.com"); // stays a path on our site
  });

  it("refuses targets that resolve to a protocol-relative path", () => {
    // Dot segments are removed when the URL is resolved, leaving "//evil.com".
    for (const t of ["/.//evil.com", "/..//evil.com", "/%2e//evil.com", "/././/evil.com", "/a/..//evil.com"]) {
      expect(safeRedirectPath(t), t).toBe("/");
    }
    expect(safeRedirectPath("/./account")).toBe("/account");
  });
});

describe("rupiah amounts", () => {
  it("reads whole rupiah with or without digit grouping", () => {
    for (const s of ["1500000", "1.500.000", "1,500,000", "Rp 1.500.000", "rp1.500.000"]) expect(parseRupiah(s)).toBe(1_500_000);
    for (const s of ["1.5", "99.99", "1.50.000", "abc", "", "-5000"]) expect(parseRupiah(s)).toBeNull();
  });

  it("caps an item at Rp 200.000.000 and requires at least Rp 10.000", () => {
    const price = (priceIdr: string) => listingSchema.safeParse({ ...validListing, priceIdr });
    expect(price("200.000.000").success).toBe(true);
    expect(price("200.000.001").success).toBe(false);
    expect(price("9.999").success).toBe(false);
    expect(price("150.000,50").success).toBe(false);
    expect(listingSchema.safeParse({ ...validListing, shippingIdr: "5.000.001" }).success).toBe(false);
  });

  it("accepts grouped amounts in the price filter and ignores junk", () => {
    expect(browseSchema.parse({ min: "1.000.000", max: "abc" })).toMatchObject({ min: 1_000_000, max: undefined });
  });
});

describe("parseListing", () => {
  it("reports basic fields and specs in the same round", () => {
    try {
      parseListing({ category: "phones", description: "short", specs: { storage: -5 } });
      expect.unreachable();
    } catch (err) {
      const paths = (err as { issues: { path: string[] }[] }).issues.map((i) => i.path.join("."));
      expect(paths).toContain("description");
      expect(paths).toContain("specs.storage");
    }
  });

  it("survives a payload that isn't a listing at all", () => {
    expect(() => parseListing(null)).toThrow();
    expect(() => parseListing({ category: "nope", specs: "x" })).toThrow();
  });
});
