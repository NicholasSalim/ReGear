// Domain enumerations. Stored as strings in the DB (see prisma/schema.prisma)
// and validated through these tuples everywhere data enters the system.

export const ROLES = ["USER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const CONDITION_GRADES = ["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR", "FOR_PARTS"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const GRADE_INFO: Record<ConditionGrade, { label: string; summary: string; tone: string }> = {
  LIKE_NEW: {
    label: "Like New",
    summary: "No visible wear. Fully functional, typically with original accessories.",
    tone: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  },
  EXCELLENT: {
    label: "Excellent",
    summary: "Faint signs of use only visible up close. Fully functional.",
    tone: "bg-teal-100 text-teal-800 ring-teal-600/20",
  },
  GOOD: {
    label: "Good",
    summary: "Light scratches or scuffs visible at arm's length. Fully functional.",
    tone: "bg-sky-100 text-sky-800 ring-sky-600/20",
  },
  FAIR: {
    label: "Fair",
    summary: "Noticeable wear such as dents or deep scratches. Works as described.",
    tone: "bg-amber-100 text-amber-800 ring-amber-600/20",
  },
  FOR_PARTS: {
    label: "For Parts",
    summary: "One or more functions do not work. Sold for repair or parts.",
    tone: "bg-rose-100 text-rose-800 ring-rose-600/20",
  },
};

export const CHECK_STATUSES = ["PASS", "MINOR", "FAIL", "NA"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const CHECK_STATUS_INFO: Record<CheckStatus, { label: string; tone: string }> = {
  PASS: { label: "Works perfectly", tone: "text-pass" },
  MINOR: { label: "Minor issue", tone: "text-[#9a6a00]" },
  FAIL: { label: "Not working", tone: "text-fail" },
  NA: { label: "Not applicable", tone: "text-slate-500" },
};

export const LISTING_STATUSES = ["DRAFT", "ACTIVE", "RESERVED", "SOLD", "REMOVED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const WARRANTY_TYPES = ["NONE", "SELLER", "MANUFACTURER"] as const;
export type WarrantyType = (typeof WARRANTY_TYPES)[number];

export const WARRANTY_INFO: Record<WarrantyType, string> = {
  NONE: "No warranty",
  SELLER: "Seller warranty",
  MANUFACTURER: "Remaining manufacturer warranty",
};

export const VERIFICATION_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ID_TYPES = ["NATIONAL_ID", "PASSPORT", "DRIVERS_LICENSE", "BUSINESS_REG"] as const;
export const ID_TYPE_LABELS: Record<(typeof ID_TYPES)[number], string> = {
  NATIONAL_ID: "National ID card",
  PASSPORT: "Passport",
  DRIVERS_LICENSE: "Driver's license",
  BUSINESS_REG: "Business registration",
};

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "RETURN_IN_PROGRESS",
  "DISPUTED",
  "REFUNDED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_INFO: Record<OrderStatus, { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "bg-slate-100 text-slate-700" },
  PAID: { label: "Paid · awaiting shipment", tone: "bg-indigo-100 text-indigo-800" },
  SHIPPED: { label: "Shipped", tone: "bg-sky-100 text-sky-800" },
  DELIVERED: { label: "Delivered", tone: "bg-teal-100 text-teal-800" },
  COMPLETED: { label: "Completed", tone: "bg-emerald-100 text-emerald-800" },
  RETURN_IN_PROGRESS: { label: "Return in progress", tone: "bg-amber-100 text-amber-800" },
  DISPUTED: { label: "In dispute", tone: "bg-rose-100 text-rose-800" },
  REFUNDED: { label: "Refunded", tone: "bg-slate-200 text-slate-800" },
  CANCELLED: { label: "Cancelled", tone: "bg-slate-100 text-slate-500" },
};

export const RETURN_REASONS = ["NOT_AS_DESCRIBED", "DAMAGED", "DEFECTIVE", "CHANGED_MIND", "OTHER"] as const;
export const RETURN_REASON_LABELS: Record<(typeof RETURN_REASONS)[number], string> = {
  NOT_AS_DESCRIBED: "Not as described in the condition report",
  DAMAGED: "Arrived damaged",
  DEFECTIVE: "Stopped working / defective",
  CHANGED_MIND: "Changed my mind",
  OTHER: "Other",
};

export const RETURN_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "SHIPPED_BACK", "RECEIVED", "REFUNDED"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved · ship the item back",
  REJECTED: "Rejected by seller",
  SHIPPED_BACK: "Shipped back to seller",
  RECEIVED: "Received by seller",
  REFUNDED: "Refunded",
};

export const DISPUTE_REASONS = [
  "NOT_RECEIVED",
  "NOT_AS_DESCRIBED",
  "DAMAGED",
  "COUNTERFEIT",
  "RETURN_ISSUE",
  "OTHER",
] as const;
export const DISPUTE_REASON_LABELS: Record<(typeof DISPUTE_REASONS)[number], string> = {
  NOT_RECEIVED: "Item not received",
  NOT_AS_DESCRIBED: "Significantly not as described",
  DAMAGED: "Item damaged in transit",
  COUNTERFEIT: "Counterfeit or not genuine",
  RETURN_ISSUE: "Problem with a return",
  OTHER: "Other",
};

export const DISPUTE_STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED"] as const;
export const DISPUTE_RESOLUTIONS = ["REFUND_BUYER", "PARTIAL_REFUND", "RELEASE_TO_SELLER"] as const;
export const DISPUTE_RESOLUTION_LABELS: Record<(typeof DISPUTE_RESOLUTIONS)[number], string> = {
  REFUND_BUYER: "Full refund to buyer",
  PARTIAL_REFUND: "Partial refund to buyer",
  RELEASE_TO_SELLER: "Release payment to seller",
};

export const CARRIERS = ["DHL", "FedEx", "UPS", "USPS", "JNE", "J&T", "SiCepat", "Other"] as const;

// Business rules
export const PLATFORM_FEE_BPS = 500; // 5% charged to the seller
// Money limits, in whole rupiah.
export const MIN_PRICE_IDR = 10_000;
export const MAX_PRICE_IDR = 200_000_000;
export const MAX_ORIGINAL_PRICE_IDR = 500_000_000; // reference only, may exceed the price cap
export const MAX_SHIPPING_IDR = 5_000_000;
export const PAYMENT_HOLD_MINUTES = 30; // unpaid orders release the listing after this
export const AUTO_COMPLETE_DAYS_AFTER_DELIVERY_BUFFER = 2; // added to the return window
export const MAX_LISTING_IMAGES = 10;
export const MAX_COMPARE = 4;
export const PAGE_SIZE = 24;
