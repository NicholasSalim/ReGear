import { BatteryMedium, PackageOpen, ScanLine } from "lucide-react";
import { getCategory, formatSpecValue } from "@/lib/catalog";
import { batteryLabel, countIssues, isCustomCheck } from "@/lib/condition";
import { CHECK_STATUS_INFO, GRADE_INFO, type CheckStatus, type ConditionGrade } from "@/lib/constants";
import type { ListingDetail } from "@/lib/data/catalog";
import { GradeBadge } from "@/components/badges";
import { ConditionStrip, stripLabel } from "@/components/condition-strip";

const STATUS_ICON: Record<CheckStatus, React.ReactNode> = {
  PASS: <span aria-hidden className="block size-2.5 rounded-[2px] bg-pass" />,
  MINOR: <span aria-hidden className="block size-2.5 rounded-[2px] bg-minor" />,
  FAIL: <span aria-hidden className="block size-2.5 rounded-[2px] bg-fail" />,
  NA: <span aria-hidden className="block size-2.5 rounded-[2px] bg-na" />,
};

export function ConditionReportView({ listing }: { listing: ListingDetail }) {
  const report = listing.conditionReport;
  const category = getCategory(listing.category);
  if (!report || !category) return null;
  const issues = countIssues(report.checks);
  const battery = batteryLabel(report.batteryHealth);
  const labelFor = new Map(category.checks.map((c) => [c.key, c.label]));

  return (
    <section aria-labelledby="condition-heading" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="condition-heading" className="text-xl font-extrabold">Condition report</h2>
          <p className="mt-1 text-sm text-slate-600">{GRADE_INFO[listing.conditionGrade as ConditionGrade]?.summary}</p>
        </div>
        <GradeBadge grade={listing.conditionGrade} className="px-2 py-1 text-sm" />
      </div>
      <div className="mt-5">
        <ConditionStrip checks={report.checks.map((c) => ({ ...c, label: c.label ?? labelFor.get(c.key) }))} size="md" />
        <p className="mt-2 text-sm text-slate-600">{stripLabel(report.checks)}</p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Functional score" value={`${report.functionalScore}/100`} />
        <Metric label="Cosmetic score" value={`${report.cosmeticScore}/10`} />
        {report.batteryHealth != null ? (
          <Metric
            label="Battery health"
            value={
              <span className="inline-flex items-center gap-1">
                <BatteryMedium className="size-4" aria-hidden /> {report.batteryHealth}%
              </span>
            }
            hint={battery ? <span className={battery.tone}>{battery.label}</span> : undefined}
          />
        ) : (
          <Metric label="Issues found" value={issues.minor + issues.failed} />
        )}
        <Metric label="Inspected by" value={report.inspectedBy === "REGEAR" ? "ReGear" : "Seller"} />
      </dl>

      <ul className="mt-5 divide-y divide-rule rounded-lg border border-rule">
        {report.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-3 px-4 py-2.5 text-sm">
            <span className="mt-1.5">{STATUS_ICON[c.status]}</span>
            <span className="flex-1">
              <span className="font-medium text-ink">{c.label ?? labelFor.get(c.key) ?? c.key}</span>
              {isCustomCheck(c.key) && (
                <span className="ml-2 rounded-[var(--radius-tag)] bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">Added by seller</span>
              )}
              {c.note && <span className="block text-slate-600">{c.note}</span>}
            </span>
            <span className={`text-xs font-medium ${CHECK_STATUS_INFO[c.status].tone}`}>{CHECK_STATUS_INFO[c.status].label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <ScanLine className="size-4 text-slate-500" aria-hidden />
          Serial / IMEI {report.serialVerified ? "checked — not reported lost or stolen" : "not verified"}
        </div>
        <div className="flex items-center gap-2">
          <PackageOpen className="size-4 text-slate-500" aria-hidden />
          {report.originalBox ? "Includes original box" : "No original box"}
        </div>
      </div>

      {report.includedAccessories.length > 0 && (
        <div className="mt-4 text-sm">
          <h3 className="font-semibold">In the box</h3>
          <p className="mt-1 text-slate-600">{report.includedAccessories.join(", ")}</p>
        </div>
      )}
      {report.knownIssues && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <h3 className="font-semibold">Known issues disclosed by the seller</h3>
          <p className="mt-1 whitespace-pre-line">{report.knownIssues}</p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-rule p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="num wide mt-0.5 text-lg font-extrabold text-ink">{value}</dd>
      {hint && <dd className="text-xs font-medium">{hint}</dd>}
    </div>
  );
}

export function SpecTable({ listing }: { listing: ListingDetail }) {
  const category = getCategory(listing.category);
  const rows: [string, string][] = [
    ["Brand", listing.brand],
    ["Model", listing.model],
    ...(category?.specFields ?? [])
      .filter((f) => listing.specs[f.key] !== undefined && listing.specs[f.key] !== "")
      .map((f) => [f.label, formatSpecValue(f, listing.specs[f.key])] as [string, string]),
  ];
  return (
    <section aria-labelledby="specs-heading" className="card p-5 sm:p-6">
      <h2 id="specs-heading" className="text-xl font-extrabold">Specifications</h2>
      <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-rule py-2 text-sm">
            <dt className="text-slate-500">{k}</dt>
            <dd className="num text-right font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
