// Domain enumerations. Stored as strings in the DB (see prisma/schema.prisma)
// and validated through these tuples everywhere data enters the system.
// Labels are bilingual (see src/i18n/locales.ts); the stored codes never change.

import type { Localized } from "@/i18n/locales";

const L = (en: string, id: string): Localized => ({ en, id });

export const ROLES = ["USER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const CONDITION_GRADES = ["LIKE_NEW", "EXCELLENT", "GOOD", "FAIR", "FOR_PARTS"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const GRADE_INFO: Record<ConditionGrade, { label: Localized; summary: Localized; tone: string }> = {
  LIKE_NEW: {
    label: L("Like New", "Seperti Baru"),
    summary: L(
      "No visible wear. Fully functional, typically with original accessories.",
      "Tanpa bekas pemakaian yang terlihat. Berfungsi penuh, biasanya dengan aksesori asli.",
    ),
    tone: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  },
  EXCELLENT: {
    label: L("Excellent", "Sangat Baik"),
    summary: L(
      "Faint signs of use only visible up close. Fully functional.",
      "Bekas pemakaian tipis yang hanya terlihat dari dekat. Berfungsi penuh.",
    ),
    tone: "bg-teal-100 text-teal-800 ring-teal-600/20",
  },
  GOOD: {
    label: L("Good", "Baik"),
    summary: L(
      "Light scratches or scuffs visible at arm's length. Fully functional.",
      "Goresan atau lecet ringan terlihat dari jarak sejangkauan tangan. Berfungsi penuh.",
    ),
    tone: "bg-sky-100 text-sky-800 ring-sky-600/20",
  },
  FAIR: {
    label: L("Fair", "Cukup"),
    summary: L(
      "Noticeable wear such as dents or deep scratches. Works as described.",
      "Bekas pemakaian jelas seperti penyok atau goresan dalam. Berfungsi sesuai deskripsi.",
    ),
    tone: "bg-amber-100 text-amber-800 ring-amber-600/20",
  },
  FOR_PARTS: {
    label: L("For Parts", "Untuk Suku Cadang"),
    summary: L(
      "One or more functions do not work. Sold for repair or parts.",
      "Satu atau lebih fungsi tidak bekerja. Dijual untuk diperbaiki atau diambil suku cadangnya.",
    ),
    tone: "bg-rose-100 text-rose-800 ring-rose-600/20",
  },
};

export const CHECK_STATUSES = ["PASS", "MINOR", "FAIL", "NA"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const CHECK_STATUS_INFO: Record<CheckStatus, { label: Localized; tone: string }> = {
  PASS: { label: L("Works perfectly", "Berfungsi sempurna"), tone: "text-pass" },
  MINOR: { label: L("Minor issue", "Masalah kecil"), tone: "text-minor-text" },
  FAIL: { label: L("Not working", "Tidak berfungsi"), tone: "text-fail" },
  NA: { label: L("Not applicable", "Tidak berlaku"), tone: "text-slate-500" },
};

export const LISTING_STATUSES = ["DRAFT", "ACTIVE", "RESERVED", "SOLD", "REMOVED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatus, Localized> = {
  DRAFT: L("Draft", "Draf"),
  ACTIVE: L("Active", "Aktif"),
  RESERVED: L("Reserved", "Dipesan"),
  SOLD: L("Sold", "Terjual"),
  REMOVED: L("Removed", "Dihapus"),
};

export const WARRANTY_TYPES = ["NONE", "SELLER", "MANUFACTURER"] as const;
export type WarrantyType = (typeof WARRANTY_TYPES)[number];

export const WARRANTY_INFO: Record<WarrantyType, Localized> = {
  NONE: L("No warranty", "Tanpa garansi"),
  SELLER: L("Seller warranty", "Garansi penjual"),
  MANUFACTURER: L("Remaining manufacturer warranty", "Sisa garansi resmi pabrikan"),
};

export const VERIFICATION_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ID_TYPES = ["NATIONAL_ID", "PASSPORT", "DRIVERS_LICENSE", "BUSINESS_REG"] as const;
export const ID_TYPE_LABELS: Record<(typeof ID_TYPES)[number], Localized> = {
  NATIONAL_ID: L("National ID card", "KTP"),
  PASSPORT: L("Passport", "Paspor"),
  DRIVERS_LICENSE: L("Driver's license", "SIM"),
  BUSINESS_REG: L("Business registration", "Dokumen legalitas usaha (NIB)"),
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

export const ORDER_STATUS_INFO: Record<OrderStatus, { label: Localized; tone: string }> = {
  PENDING_PAYMENT: { label: L("Awaiting payment", "Menunggu pembayaran"), tone: "bg-slate-100 text-slate-700" },
  PAID: { label: L("Paid · awaiting shipment", "Dibayar · menunggu pengiriman"), tone: "bg-indigo-100 text-indigo-800" },
  SHIPPED: { label: L("Shipped", "Dikirim"), tone: "bg-sky-100 text-sky-800" },
  DELIVERED: { label: L("Delivered", "Diterima"), tone: "bg-teal-100 text-teal-800" },
  COMPLETED: { label: L("Completed", "Selesai"), tone: "bg-emerald-100 text-emerald-800" },
  RETURN_IN_PROGRESS: { label: L("Return in progress", "Pengembalian berlangsung"), tone: "bg-amber-100 text-amber-800" },
  DISPUTED: { label: L("In dispute", "Dalam sengketa"), tone: "bg-rose-100 text-rose-800" },
  REFUNDED: { label: L("Refunded", "Dana dikembalikan"), tone: "bg-slate-200 text-slate-800" },
  CANCELLED: { label: L("Cancelled", "Dibatalkan"), tone: "bg-slate-100 text-slate-500" },
};

export const RETURN_REASONS = ["NOT_AS_DESCRIBED", "DAMAGED", "DEFECTIVE", "CHANGED_MIND", "OTHER"] as const;
export const RETURN_REASON_LABELS: Record<(typeof RETURN_REASONS)[number], Localized> = {
  NOT_AS_DESCRIBED: L("Not as described in the condition report", "Tidak sesuai laporan kondisi"),
  DAMAGED: L("Arrived damaged", "Tiba dalam keadaan rusak"),
  DEFECTIVE: L("Stopped working / defective", "Berhenti berfungsi / cacat"),
  CHANGED_MIND: L("Changed my mind", "Berubah pikiran"),
  OTHER: L("Other", "Lainnya"),
};

export const RETURN_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "SHIPPED_BACK", "RECEIVED", "REFUNDED"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const RETURN_STATUS_LABELS: Record<ReturnStatus, Localized> = {
  REQUESTED: L("Requested", "Diajukan"),
  APPROVED: L("Approved · ship the item back", "Disetujui · kirim barang kembali"),
  REJECTED: L("Rejected by seller", "Ditolak penjual"),
  SHIPPED_BACK: L("Shipped back to seller", "Dikirim kembali ke penjual"),
  RECEIVED: L("Received by seller", "Diterima penjual"),
  REFUNDED: L("Refunded", "Dana dikembalikan"),
};

export const DISPUTE_REASONS = [
  "NOT_RECEIVED",
  "NOT_AS_DESCRIBED",
  "DAMAGED",
  "COUNTERFEIT",
  "RETURN_ISSUE",
  "OTHER",
] as const;
export const DISPUTE_REASON_LABELS: Record<(typeof DISPUTE_REASONS)[number], Localized> = {
  NOT_RECEIVED: L("Item not received", "Barang tidak diterima"),
  NOT_AS_DESCRIBED: L("Significantly not as described", "Sangat berbeda dari deskripsi"),
  DAMAGED: L("Item damaged in transit", "Barang rusak dalam pengiriman"),
  COUNTERFEIT: L("Counterfeit or not genuine", "Palsu atau tidak orisinal"),
  RETURN_ISSUE: L("Problem with a return", "Masalah dengan pengembalian"),
  OTHER: L("Other", "Lainnya"),
};

export const DISPUTE_STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED"] as const;
export const DISPUTE_STATUS_LABELS: Record<(typeof DISPUTE_STATUSES)[number], Localized> = {
  OPEN: L("open", "dibuka"),
  UNDER_REVIEW: L("under review", "sedang ditinjau"),
  RESOLVED: L("resolved", "selesai"),
};
export const DISPUTE_RESOLUTIONS = ["REFUND_BUYER", "PARTIAL_REFUND", "RELEASE_TO_SELLER"] as const;
export const DISPUTE_RESOLUTION_LABELS: Record<(typeof DISPUTE_RESOLUTIONS)[number], Localized> = {
  REFUND_BUYER: L("Full refund to buyer", "Pengembalian dana penuh ke pembeli"),
  PARTIAL_REFUND: L("Partial refund to buyer", "Pengembalian dana sebagian ke pembeli"),
  RELEASE_TO_SELLER: L("Release payment to seller", "Teruskan pembayaran ke penjual"),
};

export const CARRIERS = ["JNE", "J&T", "SiCepat", "AnterAja", "Ninja Xpress", "Pos Indonesia", "ID Express", "Lion Parcel", "GoSend", "GrabExpress", "DHL", "Other"] as const;
export const CARRIER_LABELS: Partial<Record<(typeof CARRIERS)[number], Localized>> = { Other: L("Other", "Lainnya") };

// Business rules
export const PLATFORM_FEE_BPS = 500; // 5% charged to the seller
// Money limits, in whole rupiah.
export const MIN_PRICE_IDR = 10_000;
export const MAX_PRICE_IDR = 200_000_000;
export const MAX_ORIGINAL_PRICE_IDR = 500_000_000; // reference only, may exceed the price cap
export const MAX_SHIPPING_IDR = 5_000_000;
export const PAYMENT_HOLD_MINUTES = 30; // unpaid orders release the listing after this
export const AUTO_COMPLETE_DAYS_AFTER_DELIVERY_BUFFER = 2; // added to the return window, and given again after a rejected return
export const MAX_UNPAID_ORDERS = 3; // unpaid orders one buyer may hold at once (each reserves an item)
export const MAX_ABANDONED_CHECKOUTS = 2; // unpaid checkouts of one item a buyer may let lapse per day before waiting
export const MAX_LISTING_IMAGES = 10;
export const MAX_COMPARE = 4;
export const PAGE_SIZE = 24;

// Seller withdrawals
export const WITHDRAWAL_STATUSES = ["PENDING_REVIEW", "SENDING", "PROCESSING", "COMPLETED", "FAILED", "REJECTED", "NEEDS_ATTENTION"] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];
/** A seller can have one of these at a time. */
export const OPEN_WITHDRAWAL_STATUSES: WithdrawalStatus[] = ["PENDING_REVIEW", "SENDING", "PROCESSING", "NEEDS_ATTENTION"];
/** Why a withdrawal waits for an admin instead of going straight to the bank. */
export const WITHDRAWAL_REVIEW_REASONS = ["first", "large", "newAccount", "nameMismatch", "openDispute"] as const;
export type WithdrawalReviewReason = (typeof WITHDRAWAL_REVIEW_REASONS)[number];
export const MIN_WITHDRAWAL_IDR = 10_000;
export const WITHDRAWAL_REVIEW_ABOVE_IDR = 10_000_000;
/** A payout account changed this recently holds withdrawals for review (account takeover). */
export const NEW_PAYOUT_ACCOUNT_HOURS = 48;
