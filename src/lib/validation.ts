import { z } from "zod";
import { applicableChecks, getCategory, needsBattery, CATEGORY_SLUGS } from "@/lib/catalog";
import { isCustomCheck, MAX_CUSTOM_CHECKS } from "@/lib/condition";
import {
  CARRIERS,
  CHECK_STATUSES,
  CONDITION_GRADES,
  DISPUTE_REASONS,
  DISPUTE_RESOLUTIONS,
  ID_TYPES,
  MAX_LISTING_IMAGES,
  RETURN_REASONS,
  WARRANTY_TYPES,
} from "@/lib/constants";

// Shared primitives --------------------------------------------------------

/** Trimmed, length-bounded, control-character-free text. */
export const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min > 0 ? `Must be at least ${min} characters` : undefined)
    .max(max, `Must be at most ${max} characters`)
    .refine((s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s), "Contains invalid characters");

export const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254));

export const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  .refine((p) => /[a-zA-Z]/.test(p), "Include at least one letter")
  .refine((p) => /[0-9]/.test(p), "Include at least one number")
  .refine((p) => /[^a-zA-Z0-9\s]/.test(p), "Include at least one symbol, such as ! # or -");

export const id = z.string().regex(/^[a-z0-9]{20,32}$/i, "Invalid id");

/** Money entered as a decimal string ("1299.99") -> integer cents. */
export const moneyCents = (opts: { min?: number; max?: number } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""))))
    .pipe(z.number().finite().nonnegative())
    .transform((v) => Math.round(v * 100))
    .pipe(z.number().int().min(opts.min ?? 0).max(opts.max ?? 100_000_000));

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean(), z.undefined(), z.null()])
  .transform((v) => v === true || v === "on" || v === "true");

// Auth ---------------------------------------------------------------------

export const registerSchema = z.object({
  name: text(2, 60),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(128).default(""),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export const profileSchema = z.object({ name: text(2, 60) });

// Seller -------------------------------------------------------------------

export const sellerProfileSchema = z.object({
  displayName: text(2, 50),
  bio: text(0, 600),
  location: text(2, 80),
});

export const verificationSchema = z.object({
  legalName: text(3, 100),
  phone: z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, "Enter a valid phone number"),
  address: text(10, 300),
  idType: z.enum(ID_TYPES),
  idNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{4,30}$/, "Enter the document number (letters, digits, dashes)"),
});

// Listings -----------------------------------------------------------------

export const conditionCheckSchema = z.object({
  key: z.string().max(40),
  status: z.enum(CHECK_STATUSES),
  note: text(0, 200).optional(),
  label: text(0, 60).optional(),
});

export const listingBaseSchema = z.object({
  title: text(8, 120),
  category: z.enum(CATEGORY_SLUGS),
  brand: text(1, 40),
  model: text(1, 80),
  description: text(30, 5000),
  priceCents: moneyCents({ min: 100 }),
  originalPriceCents: moneyCents().optional().nullable(),
  shippingCents: moneyCents({ max: 100_000 }),
  location: text(2, 80),
  conditionGrade: z.enum(CONDITION_GRADES),
  warrantyType: z.enum(WARRANTY_TYPES),
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
  imageIds: z.array(id).min(1, "Add at least one photo").max(MAX_LISTING_IMAGES),
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
      else if (field.required) ctx.addIssue({ code: "custom", path: ["specs", field.key], message: `${field.label} is required` });
      continue;
    }
    if (field.type === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        ctx.addIssue({ code: "custom", path: ["specs", field.key], message: `${field.label} must be a number` });
        continue;
      }
      cleanSpecs[field.key] = n;
    } else if (field.type === "boolean") {
      cleanSpecs[field.key] = raw === true || raw === "true" || raw === "on";
    } else if (field.type === "select") {
      if (!field.options?.includes(String(raw))) {
        ctx.addIssue({ code: "custom", path: ["specs", field.key], message: `Choose a valid ${field.label.toLowerCase()}` });
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
    ctx.addIssue({ code: "custom", path: ["checks"], message: `Add at most ${MAX_CUSTOM_CHECKS} checks of your own` });
  }
  for (const c of custom) {
    if (!c.label || c.label.length < 3) {
      ctx.addIssue({ code: "custom", path: ["checks", c.key], message: "Name this check (at least 3 characters)" });
    }
  }
  data.checks = [...standard, ...custom];
  if (data.checks.length === 0) {
    ctx.addIssue({ code: "custom", path: ["checks"], message: "Include at least one check in the condition report" });
  }

  const hasBattery = needsBattery(category, cleanSpecs);
  if (hasBattery && data.conditionGrade !== "FOR_PARTS" && !data.batteryHealth) {
    ctx.addIssue({ code: "custom", path: ["batteryHealth"], message: "Battery health is required for this item" });
  }
  if (!hasBattery) data.batteryHealth = null;

  if (data.warrantyType === "NONE") {
    data.warrantyMonths = 0;
  } else if (data.warrantyMonths < 1) {
    ctx.addIssue({ code: "custom", path: ["warrantyMonths"], message: "Enter the warranty length in months" });
  }

  const failed = data.checks.filter((c) => c.status === "FAIL").length;
  if (failed > 0 && (data.conditionGrade === "LIKE_NEW" || data.conditionGrade === "EXCELLENT")) {
    ctx.addIssue({
      code: "custom",
      path: ["conditionGrade"],
      message: "Items with failed checks cannot be graded Like New or Excellent",
    });
  }
  for (const c of data.checks) {
    if (c.status !== "PASS" && c.status !== "NA" && !c.note) {
      ctx.addIssue({ code: "custom", path: ["checks", c.key], message: "Describe the issue" });
    }
  }
  if (data.originalPriceCents && data.originalPriceCents <= data.priceCents) data.originalPriceCents = null;
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
  min: z.coerce.number().nonnegative().max(1_000_000).optional().catch(undefined),
  max: z.coerce.number().nonnegative().max(1_000_000).optional().catch(undefined),
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
  phone: z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, "Enter a valid phone number"),
  line1: text(4, 150),
  line2: text(0, 150),
  city: text(2, 80),
  region: text(0, 80),
  postalCode: z.string().trim().regex(/^[A-Za-z0-9\s-]{3,10}$/, "Enter a valid postal code"),
  country: text(2, 60),
});
export type Address = z.infer<typeof addressSchema>;

export const shipSchema = z.object({
  carrier: z.enum(CARRIERS),
  trackingNumber: z.string().trim().regex(/^[A-Za-z0-9-]{5,40}$/, "Enter a valid tracking number"),
});

export const returnRequestSchema = z.object({
  reason: z.enum(RETURN_REASONS),
  details: text(20, 2000),
});

export const disputeSchema = z.object({
  reason: z.enum(DISPUTE_REASONS),
  description: text(30, 3000),
});

export const disputeMessageSchema = z.object({ body: text(2, 2000) });

export const disputeResolutionSchema = z.object({
  resolution: z.enum(DISPUTE_RESOLUTIONS),
  refundCents: moneyCents().optional(),
  note: text(10, 2000),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: text(0, 1000),
});

/** Flatten zod issues into a { field: message } map for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
