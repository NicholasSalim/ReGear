import { BadgeCheck, ShieldCheck } from "lucide-react";
import { GRADE_INFO, ORDER_STATUS_INFO, WARRANTY_INFO, type ConditionGrade, type OrderStatus, type WarrantyType } from "@/lib/constants";
import { Badge, cn } from "@/components/ui";

// Grade tags read like a QC sticker: a coloured pip plus the grade name.
const GRADE_PIP: Record<ConditionGrade, string> = {
  LIKE_NEW: "bg-pass",
  EXCELLENT: "bg-pass/70",
  GOOD: "bg-brand-600",
  FAIR: "bg-minor",
  FOR_PARTS: "bg-fail",
};

export function GradeBadge({ grade, className }: { grade: string; className?: string }) {
  const info = GRADE_INFO[grade as ConditionGrade];
  if (!info) return null;
  return (
    <Badge className={cn("bg-white text-ink ring-rule", className)}>
      <span aria-hidden className={cn("size-2 rounded-[2px]", GRADE_PIP[grade as ConditionGrade])} />
      {info.label}
    </Badge>
  );
}

export function VerifiedBadge({ status, compact }: { status: string; compact?: boolean }) {
  if (status !== "VERIFIED") return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700" title="Identity verified by ReGear">
      <BadgeCheck className="size-4" aria-hidden />
      {!compact && "Verified seller"}
    </span>
  );
}

export function WarrantyBadge({ type, months }: { type: string; months: number }) {
  if (type === "NONE" || months <= 0) return null;
  return (
    <Badge className="bg-brand-50 text-brand-800 ring-brand-600/15">
      <ShieldCheck className="size-3" aria-hidden />
      {months}-month {type === "MANUFACTURER" ? "maker" : ""} warranty
    </Badge>
  );
}

export function warrantyLabel(type: string) {
  return WARRANTY_INFO[type as WarrantyType] ?? type;
}

export function OrderStatusBadge({ status }: { status: string }) {
  const info = ORDER_STATUS_INFO[status as OrderStatus];
  return <Badge className={cn(info?.tone ?? "bg-slate-100 text-slate-700", "ring-transparent")}>{info?.label ?? status}</Badge>;
}

export function ListingStatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    DRAFT: "bg-slate-100 text-slate-700 ring-slate-500/20",
    RESERVED: "bg-amber-50 text-amber-800 ring-amber-600/20",
    SOLD: "bg-slate-800 text-white ring-slate-800",
    REMOVED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  };
  return <Badge className={tone[status] ?? tone.DRAFT}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export function Stars({ rating, count }: { rating: number; count?: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-sm" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
      <span className="text-amber-500" aria-hidden>
        {"★".repeat(full)}
        <span className="text-slate-300">{"★".repeat(5 - full)}</span>
      </span>
      {count !== undefined && <span className="text-slate-500">({count})</span>}
    </span>
  );
}
