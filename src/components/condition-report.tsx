import { BatteryMedium, PackageOpen, ScanLine } from "lucide-react";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
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

export async function ConditionReportView({ listing }: { listing: ListingDetail }) {
  const report = listing.conditionReport;
  const category = getCategory(listing.category);
  if (!report || !category) return null;
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  const issues = countIssues(report.checks);
  const battery = batteryLabel(report.batteryHealth);
  const labelFor = new Map(category.checks.map((c) => [c.key, pick(c.label, locale)]));
  // Seller-added checks carry their own label, shown as written.
  const labelled = report.checks.map((c) => ({ ...c, label: c.label ?? labelFor.get(c.key) ?? c.key }));
  const grade = GRADE_INFO[listing.conditionGrade as ConditionGrade];

  return (
    <section aria-labelledby="condition-heading" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="condition-heading" className="text-xl font-extrabold">{t.condition.heading}</h2>
          {grade && <p className="mt-1 text-sm text-slate-600">{pick(grade.summary, locale)}</p>}
        </div>
        <GradeBadge grade={listing.conditionGrade} className="px-2 py-1 text-sm" />
      </div>
      <div className="mt-5">
        <ConditionStrip checks={labelled} label={stripLabel(report.checks, t.condition)} size="md" />
        <p className="mt-2 text-sm text-slate-600">{stripLabel(report.checks, t.condition)}</p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-rule py-4 sm:grid-cols-4">
        <Metric label={t.condition.functionalScore} value={`${report.functionalScore}/100`} />
        <Metric label={t.condition.cosmeticScore} value={`${report.cosmeticScore}/10`} />
        {report.batteryHealth != null ? (
          <Metric
            label={t.condition.batteryHealth}
            value={
              <span className="inline-flex items-center gap-1">
                <BatteryMedium className="size-4" aria-hidden /> {report.batteryHealth}%
              </span>
            }
            hint={battery ? <span className={battery.tone}>{t.battery[battery.level]}</span> : undefined}
          />
        ) : (
          <Metric label={t.condition.issuesFound} value={issues.minor + issues.failed} />
        )}
        <Metric label={t.condition.inspectedBy} value={report.inspectedBy === "REGEAR" ? t.condition.inspectedByRegear : t.condition.inspectedBySeller} />
      </dl>

      <ul className="mt-5 divide-y divide-rule rounded-lg border border-rule">
        {labelled.map((c) => (
          <li key={c.key} className="flex items-start gap-3 px-4 py-2.5 text-sm">
            <span className="mt-1.5">{STATUS_ICON[c.status]}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium text-ink">{c.label}</span>
              {isCustomCheck(c.key) && (
                <span className="ml-2 rounded-[var(--radius-tag)] bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t.condition.addedBySeller}</span>
              )}
              {c.note && <span className="block text-slate-600">{c.note}</span>}
            </span>
            <span className={`text-xs font-medium ${CHECK_STATUS_INFO[c.status].tone}`}>{pick(CHECK_STATUS_INFO[c.status].label, locale)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <ScanLine className="size-4 text-slate-500" aria-hidden />
          {report.serialVerified ? t.condition.serialChecked : t.condition.serialNotVerified}
        </div>
        <div className="flex items-center gap-2">
          <PackageOpen className="size-4 text-slate-500" aria-hidden />
          {report.originalBox ? t.condition.originalBox : t.condition.noOriginalBox}
        </div>
      </div>

      {report.includedAccessories.length > 0 && (
        <div className="mt-4 text-sm">
          <h3 className="font-semibold">{t.condition.inTheBox}</h3>
          <p className="mt-1 text-slate-600">{report.includedAccessories.join(", ")}</p>
        </div>
      )}
      {report.knownIssues && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <h3 className="font-semibold">{t.condition.knownIssues}</h3>
          <p className="mt-1 whitespace-pre-line">{report.knownIssues}</p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="num wide mt-0.5 text-lg font-extrabold text-ink">{value}</dd>
      {hint && <dd className="text-xs font-medium">{hint}</dd>}
    </div>
  );
}

export async function SpecTable({ listing }: { listing: ListingDetail }) {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  const category = getCategory(listing.category);
  const rows: [string, string][] = [
    [t.condition.brand, listing.brand],
    [t.condition.model, listing.model],
    ...(category?.specFields ?? [])
      .filter((f) => listing.specs[f.key] !== undefined && listing.specs[f.key] !== "")
      .map((f) => [pick(f.label, locale), formatSpecValue(f, listing.specs[f.key], locale)] as [string, string]),
  ];
  return (
    <section aria-labelledby="specs-heading" className="card p-5 sm:p-6">
      <h2 id="specs-heading" className="text-xl font-extrabold">{t.condition.specifications}</h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
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
