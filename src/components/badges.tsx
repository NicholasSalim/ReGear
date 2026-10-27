import { BadgeCheck, ShieldCheck } from "lucide-react";
import { pick, type Locale } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import {
  GRADE_INFO,
  LISTING_STATUS_LABELS,
  ORDER_STATUS_INFO,
  WARRANTY_INFO,
  type ConditionGrade,
  type ListingStatus,
  type OrderStatus,
  type WarrantyType,
} from "@/lib/constants";
import { Badge, cn } from "@/components/ui";

// Grade tags read like a QC sticker: a coloured pip plus the grade name.
const GRADE_PIP: Record<ConditionGrade, string> = {
  LIKE_NEW: "bg-pass",
  EXCELLENT: "bg-pass/70",
  GOOD: "bg-brand-600",
  FAIR: "bg-minor",
  FOR_PARTS: "bg-fail",
};

export async function GradeBadge({ grade, className }: { grade: string; className?: string }) {
  const info = GRADE_INFO[grade as ConditionGrade];
  if (!info) return null;
  const locale = await getLocale();
  return (
    <Badge className={cn("bg-white text-ink ring-rule", className)}>
      <span aria-hidden className={cn("size-2 rounded-[2px]", GRADE_PIP[grade as ConditionGrade])} />
      {pick(info.label, locale)}
    </Badge>
  );
}

export async function VerifiedBadge({ status, compact }: { status: string; compact?: boolean }) {
  if (status !== "VERIFIED") return null;
  const t = await getDictionary();
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700" title={t.badges.verifiedTitle}>
      <BadgeCheck className="size-4" aria-hidden />
      {!compact && t.badges.verifiedSeller}
    </span>
  );
}

export async function WarrantyBadge({ type, months }: { type: string; months: number }) {
  if (type === "NONE" || months <= 0) return null;
  const t = await getDictionary();
  return (
    <Badge className="bg-brand-50 text-brand-800 ring-brand-600/15">
      <ShieldCheck className="size-3" aria-hidden />
      {t.badges.warranty(months, type === "MANUFACTURER")}
    </Badge>
  );
}

export function warrantyLabel(type: string, locale: Locale) {
  const label = WARRANTY_INFO[type as WarrantyType];
  return label ? pick(label, locale) : type;
}

export async function OrderStatusBadge({ status }: { status: string }) {
  const info = ORDER_STATUS_INFO[status as OrderStatus];
  const locale = await getLocale();
  return <Badge className={cn(info?.tone ?? "bg-slate-100 text-slate-700", "ring-transparent")}>{info ? pick(info.label, locale) : status}</Badge>;
}

export async function WithdrawalStatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    PENDING_REVIEW: "bg-amber-50 text-amber-800 ring-amber-600/20",
    SENDING: "bg-sky-50 text-sky-800 ring-sky-600/20",
    PROCESSING: "bg-sky-50 text-sky-800 ring-sky-600/20",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    FAILED: "bg-rose-50 text-rose-700 ring-rose-600/20",
    REJECTED: "bg-rose-50 text-rose-700 ring-rose-600/20",
    NEEDS_ATTENTION: "bg-amber-50 text-amber-800 ring-amber-600/20",
  };
  const t = (await getDictionary()).payouts.status;
  return <Badge className={tone[status] ?? "bg-slate-100 text-slate-700 ring-slate-500/20"}>{t[status] ?? status}</Badge>;
}

export async function ListingStatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    DRAFT: "bg-slate-100 text-slate-700 ring-slate-500/20",
    RESERVED: "bg-amber-50 text-amber-800 ring-amber-600/20",
    SOLD: "bg-slate-800 text-white ring-slate-800",
    REMOVED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  };
  const label = LISTING_STATUS_LABELS[status as ListingStatus];
  const locale = await getLocale();
  return <Badge className={tone[status] ?? tone.DRAFT}>{label ? pick(label, locale) : status}</Badge>;
}

export async function Stars({ rating, count }: { rating: number; count?: number }) {
  const full = Math.round(rating);
  const t = await getDictionary();
  return (
    <span className="inline-flex items-center gap-1 text-sm" aria-label={t.badges.rated(rating.toFixed(1))}>
      <span className="text-amber-500" aria-hidden>
        {"★".repeat(full)}
        <span className="text-slate-300">{"★".repeat(5 - full)}</span>
      </span>
      {count !== undefined && <span className="text-slate-500">({count})</span>}
    </span>
  );
}
