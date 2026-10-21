import { describe, expect, it } from "vitest";
import { applicableChecks, getCategory, needsBattery, type Specs } from "@/lib/catalog";
import { listingSchema } from "@/lib/validation";

const keys = (slug: string, specs: Specs) => applicableChecks(getCategory(slug)!, specs).map((c) => c.key);

describe("checklist by device type and features", () => {
  it("checks every smartwatch's display and crown, and cellular only when it has it", () => {
    expect(keys("smartwatches", { connectivity: "GPS" })).toEqual(["screen", "sensors", "crown", "charging", "body"]);
    expect(keys("smartwatches", { connectivity: "GPS + Cellular" })).toContain("cellular");
  });

  it("gives lenses lens checks instead of body checks", () => {
    const lens = keys("cameras", { type: "Lens" });
    expect(lens).toEqual(expect.arrayContaining(["sensor", "aperture", "rings", "mount"]));
    for (const k of ["shutter", "screen", "controls", "battery"]) expect(lens).not.toContain(k);
    expect(keys("cameras", { type: "Mirrorless" })).toContain("shutter");
  });

  it("only asks wireless audio about pairing, charging and battery", () => {
    const audio = getCategory("audio")!;
    const dac = keys("audio", { type: "DAC / Amp", wireless: false, anc: false });
    for (const k of ["pairing", "charging", "anc", "padding"]) expect(dac).not.toContain(k);
    expect(needsBattery(audio, { type: "DAC / Amp", wireless: false })).toBe(false);
    expect(keys("audio", { type: "Over-ear", wireless: true, anc: true })).toEqual(
      expect.arrayContaining(["anc", "pairing", "charging", "padding"]),
    );
    expect(needsBattery(audio, { type: "Over-ear", wireless: true })).toBe(true);
  });

  it("checks RAM for errors but not fans or thermals", () => {
    const ram = keys("pc-components", { componentType: "RAM" });
    expect(ram).toEqual(expect.arrayContaining(["stressTest", "artifacts"]));
    expect(ram).not.toContain("fans");
    expect(ram).not.toContain("thermals");
    expect(keys("pc-components", { componentType: "Storage" })).toContain("driveHealth");
  });

  it("shows no type-specific checks until a type is chosen", () => {
    expect(keys("cameras", {})).not.toContain("shutter");
  });
});

describe("listing validation with type-specific checklists", () => {
  const dacChecks = keys("audio", { type: "DAC / Amp", wireless: false }).map((key) => ({ key, status: "PASS" as const }));
  const dacListing = {
    title: "FiiO K7 desktop DAC and amp",
    category: "audio",
    brand: "FiiO",
    model: "K7",
    description: "Desktop DAC and headphone amp, used on a desk at home for a year. Works perfectly.",
    priceCents: "120",
    shippingCents: "0",
    location: "Jakarta",
    conditionGrade: "EXCELLENT",
    warrantyType: "NONE",
    warrantyMonths: "0",
    warrantyTerms: "",
    returnWindowDays: "7",
    specs: { type: "DAC / Amp", wireless: false },
    batteryHealth: null,
    cosmeticScore: "9",
    checks: dacChecks,
    includedAccessories: [],
    knownIssues: "",
    serialVerified: false,
    originalBox: false,
    imageIds: ["clx0000000000000000000000"],
    publish: true,
  };

  it("accepts a wired DAC without battery health or wireless checks", () => {
    const res = listingSchema.safeParse(dacListing);
    expect(res.success).toBe(true);
    expect(res.success && res.data.checks.map((c) => c.key)).toEqual(dacChecks.map((c) => c.key));
  });

  it("lets the seller leave checks out, but not all of them", () => {
    const res = listingSchema.safeParse({ ...dacListing, checks: dacChecks.slice(1) });
    expect(res.success && res.data.checks.map((c) => c.key)).toEqual(dacChecks.slice(1).map((c) => c.key));
    const empty = listingSchema.safeParse({ ...dacListing, checks: [] });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues.some((i) => i.path[0] === "checks")).toBe(true);
  });

  it("drops ratings for checks that do not apply", () => {
    const res = listingSchema.safeParse({ ...dacListing, checks: [...dacChecks, { key: "pairing", status: "PASS" }] });
    expect(res.success && res.data.checks.some((c) => c.key === "pairing")).toBe(false);
  });
});
