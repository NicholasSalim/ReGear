import { z } from "zod";
import { translateValidation, vmsg } from "@/i18n/messages";
import type { Locale } from "@/i18n/locales";
import type { Dictionary } from "@/i18n/server";
import { applicableChecks, getCategory, needsBattery, CATEGORY_SLUGS } from "@/lib/catalog";
import { isCustomCheck, MAX_CUSTOM_CHECKS } from "@/lib/condition";
import { formatMoney } from "@/lib/format";
import {
  CARRIERS,
  CHECK_STATUSES,
  CONDITION_GRADES,
  DISPUTE_REASONS,
  DISPUTE_RESOLUTIONS,
  ID_TYPES,
  MAX_LISTING_IMAGES,
  MAX_ORIGINAL_PRICE_IDR,
  MAX_PRICE_IDR,
  MAX_SHIPPING_IDR,
  MIN_PRICE_IDR,
  RETURN_REASONS,
  WARRANTY_TYPES,
} from "@/lib/constants";

// Messages are dictionary keys (vmsg), translated by fieldErrors() into the
// visitor's language once the action knows it.

// Shared primitives --------------------------------------------------------

/** Trimmed, length-bounded, control-character-free text. */
export const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min > 0 ? vmsg("minChars", min) : undefined)
    .max(max, vmsg("maxChars", max))
    .refine((s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s), vmsg("invalidChars"));

/** A select whose value must be one of `values`. */
const choice = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values, { error: vmsg("choose") });

export const email = z.string().trim().toLowerCase().pipe(z.email(vmsg("email")).max(254, vmsg("email")));

export const password = z
  .string()
  .min(8, vmsg("passwordMin", 8))
  .max(128, vmsg("passwordMax", 128))
  .refine((p) => /[a-zA-Z]/.test(p), vmsg("passwordLetter"))
  .refine((p) => /[0-9]/.test(p), vmsg("passwordNumber"))
  .refine((p) => /[^a-zA-Z0-9\s]/.test(p), vmsg("passwordSymbol"));

export const id = z.string().regex(/^[a-z0-9]{20,32}$/i, vmsg("invalidId"));

/** Whole rupiah, with or without digit grouping: "1500000", "1.500.000", "1,500,000", "Rp 1.500.000". */
export function parseRupiah(input: string): number | null {
  const s = input.trim().replace(/^rp\.?\s*/i, "").replace(/\s/g, "");
  return /^(\d{1,3}([.,]\d{3})+|\d+)$/.test(s) ? Number(s.replace(/[.,]/g, "")) : null;
}

/** A whole-rupiah amount between `min` (default 0) and `max`. */
export const moneyIdr = (opts: { min?: number; max: number }) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = typeof v === "number" ? v : parseRupiah(v);
      if (n === null || !Number.isInteger(n)) {
        ctx.addIssue({ code: "custom", message: vmsg("rupiah") });
        return z.NEVER;
      }
      return n;
    })
    .pipe(
      z
        .number()
        .min(opts.min ?? 0, vmsg("moneyMin", formatMoney(opts.min ?? 0)))
        .max(opts.max, vmsg("moneyMax", formatMoney(opts.max))),
    );

/** Price filter from a GET form: accepts the same formats, ignores anything invalid. */
const browsePrice = z
  .string()
  .optional()
  .transform((v) => (v ? (parseRupiah(v) ?? undefined) : undefined))
  .pipe(z.number().max(MAX_ORIGINAL_PRICE_IDR).optional())
  .catch(undefined);

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean(), z.undefined(), z.null()])
  .transform((v) => v === true || v === "on" || v === "true");

const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, vmsg("phone"));

// Auth ---------------------------------------------------------------------

export const registerSchema = z.object({
  name: text(2, 60),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, vmsg("enterPassword")).max(128, vmsg("passwordMax", 128)),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(128).default(""),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: vmsg("passwordsMismatch"), path: ["confirmPassword"] });

export const profileSchema = z.object({ name: text(2, 60) });

// Seller -------------------------------------------------------------------

export const sellerProfileSchema = z.object({
  displayName: text(2, 50),
  bio: text(0, 600),
  location: text(2, 80),
});

export const verificationSchema = z.object({
  legalName: text(3, 100),
  phone,
  address: text(10, 300),
  idType: choice(ID_TYPES),
  idNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{4,30}$/, vmsg("idNumber")),
});

// Listings -----------------------------------------------------------------

export const conditionCheckSchema = z.object({
  key: z.string().max(40),
  status: choice(CHECK_STATUSES),
  note: text(0, 200).optional(),
  label: text(0, 60).optional(),
});

export const listingBaseSchema = z.object({
  title: text(8, 120),
  category: choice(CATEGORY_SLUGS),
  brand: text(1, 40),
  model: text(1, 80),
  description: text(30, 5000),
  priceIdr: moneyIdr({ min: MIN_PRICE_IDR, max: MAX_PRICE_IDR }),
  originalPriceIdr: moneyIdr({ max: MAX_ORIGINAL_PRICE_IDR }).optional().nullable(),
  shippingIdr: moneyIdr({ max: MAX_SHIPPING_IDR }),
  location: text(2, 80),
  conditionGrade: choice(CONDITION_GRADES),
  warrantyType: choice(WARRANTY_TYPES),
  warrantyMonths: z.coerce.number().int().min(0).max(36),
  warrantyTerms: text(0, 1000),
  returnWindowDays: z.coerce.number().int().min(0).max(30),
  specs: z.record(z.string().max(40), z.union([z.string().max(120), z.number(), z.boolean()])),
  batteryHealth: z.coerce.number().int().min(1).max(100).optional().nullable(),
  cosmeticScore: z.coerce.number().int().min(1).max(10),
  checks: z.array(conditionCheckSchema).max(30),
  includedAccessories: z.array(text(1, 60)).max(20),
  knownIssues: text(0, 1000),
  serialVerified: checkbox,
  originalBox: checkbox,
  imageIds: z.array(id).min(1, vmsg("addPhoto")).max(MAX_LISTING_IMAGES),
  publish: checkbox,
});

/**
 * Full listing validation including category-specific rules: required spec
 * fields, typed spec values, a complete condition checklist and warranty
 * consistency. Unknown spec keys are dropped.
 */
export const listingSchema = listingBaseSchema.superRefine((data, ctx) => {
  const category = getCategory(data.category);
  if (!category) return;

  const cleanSpecs: Record<string, string | number | boolean> = {};
  for (const field of category.specFields) {
    const raw = data.specs[field.key];
    const empty = raw === undefined || raw === "" || raw === null;
    if (empty) {
      if (field.type === "boolean") cleanSpecs[field.key] = false;
      else if (field.required) ctx.addIssue({ code: "custom", path: ["specs", field.key], message: vmsg("specRequired", field.label) });
      continue;
    }
    if (field.type === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        ctx.addIssue({ code: "custom", path: ["specs", field.key], message: vmsg("specNumber", field.label) });
        continue;
      }
      cleanSpecs[field.key] = n;
    } else if (field.type === "boolean") {
      cleanSpecs[field.key] = raw === true || raw === "true" || raw === "on";
    } else if (field.type === "select") {
      if (!field.options?.includes(String(raw))) {
        ctx.addIssue({ code: "custom", path: ["specs", field.key], message: vmsg("specChoose", field.label) });
        continue;
      }
      cleanSpecs[field.key] = String(raw);
    } else {
      cleanSpecs[field.key] = String(raw).trim().slice(0, 120);
    }
  }
  data.specs = cleanSpecs;

  // Sellers choose which of the checks that apply to this device to include,
  // and may add up to MAX_CUSTOM_CHECKS of their own (named) checks after them.
  // Ratings for checks that don't apply are dropped; at least one must remain.
  const applicable = applicableChecks(category, cleanSpecs);
  const provided = new Map(data.checks.map((c) => [c.key, c]));
  const standard = applicable.flatMap((c) => {
    const entry = provided.get(c.key);
    return entry ? [{ key: entry.key, status: entry.status, ...(entry.note ? { note: entry.note } : {}) }] : [];
  });
  const custom = [...provided.values()].filter((c) => isCustomCheck(c.key));
  if (custom.length > MAX_CUSTOM_CHECKS) {
    ctx.addIssue({ code: "custom", path: ["checks"], message: vmsg("maxCustom", MAX_CUSTOM_CHECKS) });
  }
  for (const c of custom) {
    if (!c.label || c.label.length < 3) {
      ctx.addIssue({ code: "custom", path: ["checks", c.key], message: vmsg("nameCheck") });
    }
  }
  data.checks = [...standard, ...custom];
  if (data.checks.length === 0) {
    ctx.addIssue({ code: "custom", path: ["checks"], message: vmsg("oneCheck") });
  }

  const hasBattery = needsBattery(category, cleanSpecs);
  if (hasBattery && data.conditionGrade !== "FOR_PARTS" && !data.batteryHealth) {
    ctx.addIssue({ code: "custom", path: ["batteryHealth"], message: vmsg("batteryRequired") });
  }
  if (!hasBattery) data.batteryHealth = null;

  if (data.warrantyType === "NONE") {
    data.warrantyMonths = 0;
  } else if (data.warrantyMonths < 1) {
    ctx.addIssue({ code: "custom", path: ["warrantyMonths"], message: vmsg("warrantyMonths") });
  }

  const failed = data.checks.filter((c) => c.status === "FAIL").length;
  if (failed > 0 && (data.conditionGrade === "LIKE_NEW" || data.conditionGrade === "EXCELLENT")) {
    ctx.addIssue({ code: "custom", path: ["conditionGrade"], message: vmsg("failedGrade") });
  }
  for (const c of data.checks) {
    if (c.status !== "PASS" && c.status !== "NA" && !c.note) {
      ctx.addIssue({ code: "custom", path: ["checks", c.key], message: vmsg("describeIssue") });
    }
  }
  if (data.originalPriceIdr && data.originalPriceIdr <= data.priceIdr) data.originalPriceIdr = null;
});

export type ListingInput = z.infer<typeof listingSchema>;

// Browse -------------------------------------------------------------------

export const SORTS = ["newest", "price_asc", "price_desc", "best_condition"] as const;

export const browseSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.enum(CATEGORY_SLUGS).optional().catch(undefined),
  grade: z
    .union([z.enum(CONDITION_GRADES), z.array(z.enum(CONDITION_GRADES))])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
    .catch([]),
  min: browsePrice,
  max: browsePrice,
  brand: z.string().trim().max(40).optional().catch(undefined),
  verified: z
    .enum(["1"])
    .optional()
    .transform((v) => v === "1")
    .catch(false),
  warranty: z
    .enum(["1"])
    .optional()
    .transform((v) => v === "1")
    .catch(false),
  sort: z.enum(SORTS).default("newest").catch("newest"),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});
export type BrowseParams = z.infer<typeof browseSchema>;

// Orders -------------------------------------------------------------------

export const addressSchema = z.object({
  fullName: text(2, 100),
  phone,
  line1: text(4, 150),
  line2: text(0, 150),
  city: text(2, 80),
  region: text(0, 80),
  postalCode: z.string().trim().regex(/^[A-Za-z0-9\s-]{3,10}$/, vmsg("postalCode")),
  country: text(2, 60),
});
export type Address = z.infer<typeof addressSchema>;

export const shipSchema = z.object({
  carrier: choice(CARRIERS),
  trackingNumber: z.string().trim().regex(/^[A-Za-z0-9-]{5,40}$/, vmsg("tracking")),
});

export const returnRequestSchema = z.object({
  reason: choice(RETURN_REASONS),
  details: text(20, 2000),
});

export const disputeSchema = z.object({
  reason: choice(DISPUTE_REASONS),
  description: text(30, 3000),
});

export const disputeMessageSchema = z.object({ body: text(2, 2000) });

export const disputeResolutionSchema = z.object({
  resolution: choice(DISPUTE_RESOLUTIONS),
  refundIdr: moneyIdr({ min: 1, max: MAX_PRICE_IDR + MAX_SHIPPING_IDR }).optional(),
  note: text(10, 2000),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: text(0, 1000),
});

/** Flatten zod issues into a { field: message } map for forms, in the visitor's language. */
export function fieldErrors(error: z.ZodError, t: Dictionary, locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= translateValidation(issue.message, t, locale);
  }
  return out;
}
