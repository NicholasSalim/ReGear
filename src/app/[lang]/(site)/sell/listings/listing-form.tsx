"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, X } from "lucide-react";
import { saveListingAction } from "@/actions/listings";
import { useLocale, useT } from "@/i18n/client";
import { localePath, pick } from "@/i18n/locales";
import { shrinkImage } from "@/lib/shrink-image";
import { applicableChecks, CATEGORIES, getCategory, needsBattery, optionLabel } from "@/lib/catalog";
import { functionalScore, isCustomCheck, MAX_CUSTOM_CHECKS, type ConditionCheckEntry } from "@/lib/condition";
import {
  CHECK_STATUS_INFO,
  CHECK_STATUSES,
  CONDITION_GRADES,
  GRADE_INFO,
  MAX_LISTING_IMAGES,
  MAX_PRICE_IDR,
  MIN_PRICE_IDR,
  WARRANTY_INFO,
  WARRANTY_TYPES,
  type CheckStatus,
} from "@/lib/constants";
import { Button, Field } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { ListingFormValues } from "./listing-form-values";
import { RichText } from "@/components/rich-text";

export function ListingForm({ listingId, initial }: { listingId: string | null; initial: ListingFormValues }) {
  const locale = useLocale();
  const t = useT().listingForm;
  const router = useRouter();
  const [v, setV] = useState<ListingFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Upload problems are shown with the photos, apart from save errors.
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [saving, startSaving] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const category = getCategory(v.category)!;
  // The checklist follows the device type and features chosen in the specs.
  const applicable = useMemo(() => applicableChecks(category, v.specs), [category, v.specs]);
  const checks = useMemo(
    () => applicable.map((c) => v.checks.find((x) => x.key === c.key) ?? { key: c.key, status: "PASS" as CheckStatus, note: "" }),
    [applicable, v.checks],
  );
  // Sellers untick checks they can't show; those stay out of the report.
  // They can also add their own named checks, which always go in.
  const standardIncluded = checks.filter((c) => !v.excludedChecks.includes(c.key));
  const custom = v.checks.filter((c) => isCustomCheck(c.key));
  const included = [...standardIncluded, ...custom];
  const score = functionalScore(included);
  const hasBattery = needsBattery(category, v.specs);
  const typeField = category.specFields.find((f) => f.key === "type" || f.key === "componentType");
  const typeMissing = typeField !== undefined && !v.specs[typeField.key];

  const set = <K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const setSpec = (key: string, value: string | boolean) => setV((prev) => ({ ...prev, specs: { ...prev.specs, [key]: value } }));
  // Keep ratings of checks that are currently hidden, in case the seller switches back.
  const setCheck = (key: string, patch: Partial<ConditionCheckEntry>) =>
    setV((prev) => {
      const existing = prev.checks.find((c) => c.key === key);
      if (existing) return { ...prev, checks: prev.checks.map((c) => (c.key === key ? { ...c, ...patch } : c)) };
      return { ...prev, checks: [...prev.checks, { ...checks.find((c) => c.key === key)!, ...patch }] };
    });
  const addCustomCheck = () =>
    setV((prev) => ({ ...prev, checks: [...prev.checks, { key: `custom-${Date.now().toString(36)}`, label: "", status: "PASS", note: "" }] }));
  const removeCustomCheck = (key: string) => setV((prev) => ({ ...prev, checks: prev.checks.filter((c) => c.key !== key) }));
  const toggleCheck = (key: string, include: boolean) =>
    setV((prev) => ({
      ...prev,
      excludedChecks: include ? prev.excludedChecks.filter((k) => k !== key) : [...prev.excludedChecks, key],
    }));

  async function uploadFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_LISTING_IMAGES - v.images.length;
    const batch = Array.from(files).slice(0, room);
    setUploadError(null);
    for (const original of batch) {
      const file = await shrinkImage(original);
      if (file.size > 8 * 1024 * 1024) {
        setUploadError(t.tooLarge(original.name));
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body });
        // A host's own error page (e.g. "request too large") isn't JSON.
        const json = await res.json().catch(() => ({}));
        if (res.status === 413) setUploadError(t.tooLarge(original.name));
        else if (!res.ok) setUploadError(json.error ?? t.uploadFailed);
        else setV((prev) => ({ ...prev, images: [...prev.images, { id: json.id, url: json.url }].slice(0, MAX_LISTING_IMAGES) }));
      } catch {
        setUploadError(t.offline);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function moveImage(index: number, dir: -1 | 1) {
    setV((prev) => {
      const images = [...prev.images];
      const target = index + dir;
      if (target < 0 || target >= images.length) return prev;
      [images[index], images[target]] = [images[target], images[index]];
      return { ...prev, images };
    });
  }

  function submit(publish: boolean) {
    setErrors({});
    setFormError(null);
    setUploadError(null);
    const payload = {
      title: v.title,
      category: v.category,
      brand: v.brand,
      model: v.model,
      description: v.description,
      priceIdr: v.price,
      originalPriceIdr: v.originalPrice || null,
      shippingIdr: v.shipping || "0",
      location: v.location,
      conditionGrade: v.conditionGrade,
      warrantyType: v.warrantyType,
      warrantyMonths: v.warrantyMonths || "0",
      warrantyTerms: v.warrantyTerms,
      returnWindowDays: v.returnWindowDays || "0",
      acceptsOffers: v.acceptsOffers,
      specs: Object.fromEntries(category.specFields.map((f) => [f.key, v.specs[f.key] ?? ""])),
      batteryHealth: hasBattery && v.batteryHealth ? v.batteryHealth : null,
      cosmeticScore: v.cosmeticScore,
      checks: included.map((c) => ({ key: c.key, status: c.status, note: c.note || undefined, label: c.label?.trim() || undefined })),
      includedAccessories: v.includedAccessories.split(",").map((s) => s.trim()).filter(Boolean),
      knownIssues: v.knownIssues,
      serialVerified: v.serialVerified,
      originalBox: v.originalBox,
      imageIds: v.images.map((i) => i.id),
      publish,
    };
    startSaving(async () => {
      const res = await saveListingAction(listingId, payload);
      if (res.ok) {
        router.push(localePath("/sell/listings", locale));
        router.refresh();
        return;
      }
      setFormError(res.error ?? t.saveFailed);
      setErrors(res.fieldErrors ?? {});
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const err = (k: string) => errors[k];

  // Name of the field an error key belongs to, for the summary at the top.
  const FIELD_NAMES: Record<string, string> = {
    title: t.title,
    category: t.category,
    brand: t.brand,
    model: t.model,
    location: t.shipsFrom,
    description: t.description,
    priceIdr: t.price,
    originalPriceIdr: t.originalPrice,
    shippingIdr: t.shipping,
    conditionGrade: t.overallGrade,
    warrantyType: t.warranty,
    warrantyMonths: t.warrantyMonths,
    warrantyTerms: t.warrantyTerms,
    returnWindowDays: t.returnWindow,
    batteryHealth: t.battery,
    cosmeticScore: t.cosmetic,
    knownIssues: t.knownIssues,
    includedAccessories: t.accessories,
    imageIds: t.photos,
    checks: t.report,
  };
  function fieldName(key: string): string | undefined {
    const [head, sub] = key.split(".");
    if (head === "specs" && sub) {
      const field = category.specFields.find((f) => f.key === sub);
      return field && pick(field.label, locale);
    }
    if (head === "checks" && sub) {
      const standard = applicable.find((c) => c.key === sub);
      if (standard) return pick(standard.label, locale);
      const index = custom.findIndex((c) => c.key === sub);
      if (index >= 0) return custom[index].label?.trim() || t.customName(index + 1);
    }
    return FIELD_NAMES[head];
  }
  const errorList = Object.entries(errors);
  const SUMMARY_LIMIT = 6;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit(true);
      }}
      noValidate
    >
      {formError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError}
          {errorList.length > 0 && (
            <span className="mt-1 block text-xs">
              {errorList.slice(0, SUMMARY_LIMIT).map(([key, message]) => {
                const name = fieldName(key);
                return (
                  <span key={key} className="block">
                    • {name ? <strong className="font-semibold">{name}:</strong> : null} {message}
                  </span>
                );
              })}
              {errorList.length > SUMMARY_LIMIT && <span className="block">{t.moreErrors(errorList.length - SUMMARY_LIMIT)}</span>}
            </span>
          )}
        </p>
      )}

      <Section title={t.photos} description={t.photosHint(MAX_LISTING_IMAGES)}>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {v.images.map((img, i) => (
            <li key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <Image src={img.url} alt={t.photoAlt(i + 1)} fill sizes="160px" className="object-cover" />
              {i === 0 && <span className="absolute top-1 left-1 rounded bg-inverse/80 px-1.5 text-[10px] font-semibold text-white">{t.cover}</span>}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-inverse/60 p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                <button type="button" onClick={() => moveImage(i, -1)} className="rounded p-1 text-white hover:bg-white/20" aria-label={t.moveLeft}><ArrowLeft className="size-3.5" /></button>
                <button type="button" onClick={() => set("images", v.images.filter((x) => x.id !== img.id))} className="rounded p-1 text-white hover:bg-white/20" aria-label={t.removePhoto}><X className="size-3.5" /></button>
                <button type="button" onClick={() => moveImage(i, 1)} className="rounded p-1 text-white hover:bg-white/20" aria-label={t.moveRight}><ArrowRight className="size-3.5" /></button>
              </div>
            </li>
          ))}
          {v.images.length < MAX_LISTING_IMAGES && (
            <li>
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-500 hover:text-brand-700">
                {uploading > 0 ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
                {uploading > 0 ? t.uploading : t.addPhotos}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={(e) => uploadFiles(e.target.files)} />
              </label>
            </li>
          )}
        </ul>
        {uploadError && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {uploadError}
          </p>
        )}
        {err("imageIds") && <p className="text-xs font-medium text-rose-600">{err("imageIds")}</p>}
      </Section>

      <Section title={t.basics}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t.title} name="title" error={err("title")} hint={t.titleHint}>
              <input id="title" className="input" value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
            </Field>
          </div>
          <Field label={t.category} name="category" error={err("category")}>
            <select id="category" className="input" value={v.category} onChange={(e) => setV((p) => ({ ...p, category: e.target.value, checks: [], specs: {} }))}>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{pick(c.name, locale)}</option>
              ))}
            </select>
          </Field>
          <Field label={t.brand} name="brand" error={err("brand")}>
            <input id="brand" className="input" value={v.brand} maxLength={40} onChange={(e) => set("brand", e.target.value)} />
          </Field>
          <Field label={t.model} name="model" error={err("model")}>
            <input id="model" className="input" value={v.model} maxLength={80} onChange={(e) => set("model", e.target.value)} />
          </Field>
          <Field label={t.shipsFrom} name="location" error={err("location")}>
            <input id="location" className="input" value={v.location} maxLength={80} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t.description} name="description" error={err("description")} hint={t.descriptionHint}>
              <textarea id="description" rows={5} className="input" value={v.description} maxLength={5000} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title={t.specsTitle(pick(category.singular, locale))} description={t.specsHint}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {category.specFields.map((f) => {
            const id = `spec-${f.key}`;
            const value = v.specs[f.key];
            const label = `${pick(f.label, locale)}${f.unit ? ` (${f.unit})` : ""}${f.required ? " *" : ""}`;
            if (f.type === "boolean") {
              return (
                <label key={f.key} className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={value === true} onChange={(e) => setSpec(f.key, e.target.checked)} />
                  {pick(f.label, locale)}
                </label>
              );
            }
            return (
              <Field key={f.key} label={label} name={id} error={err(`specs.${f.key}`)}>
                {f.type === "select" ? (
                  <select id={id} className="input" value={String(value ?? "")} onChange={(e) => setSpec(f.key, e.target.value)}>
                    <option value="">—</option>
                    {f.options?.map((o) => <option key={o} value={o}>{optionLabel(f, o, locale)}</option>)}
                  </select>
                ) : (
                  <input
                    id={id}
                    className="input"
                    type={f.type === "number" ? "number" : "text"}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    min={f.type === "number" ? 0 : undefined}
                    placeholder={f.placeholder && pick(f.placeholder, locale)}
                    value={String(value ?? "")}
                    maxLength={120}
                    onChange={(e) => setSpec(f.key, e.target.value)}
                  />
                )}
              </Field>
            );
          })}
        </div>
      </Section>

      <Section title={t.report} description={t.reportHint}>
        <fieldset>
          <legend className="label">{t.overallGrade}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {CONDITION_GRADES.map((g) => (
              <label key={g} className={`cursor-pointer rounded-lg border p-3 text-sm ${v.conditionGrade === g ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                <input type="radio" name="conditionGrade" value={g} checked={v.conditionGrade === g} onChange={() => set("conditionGrade", g)} className="sr-only" />
                <span className="block font-semibold">{pick(GRADE_INFO[g].label, locale)}</span>
                <span className="mt-1 block text-xs text-slate-500">{pick(GRADE_INFO[g].summary, locale)}</span>
              </label>
            ))}
          </div>
          {err("conditionGrade") && <p className="mt-1 text-xs font-medium text-rose-600">{err("conditionGrade")}</p>}
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {hasBattery && (
            <Field label={t.battery} name="batteryHealth" error={err("batteryHealth")} hint={t.batteryHint}>
              <input id="batteryHealth" type="number" min={1} max={100} className="input" value={v.batteryHealth} onChange={(e) => set("batteryHealth", e.target.value)} />
            </Field>
          )}
          <Field label={t.cosmetic} name="cosmeticScore" error={err("cosmeticScore")}>
            <input id="cosmeticScore" type="number" min={1} max={10} className="input" value={v.cosmeticScore} onChange={(e) => set("cosmeticScore", e.target.value)} />
          </Field>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t.functional}</p>
            <p className="text-2xl font-bold">{score}/100</p>
          </div>
        </div>

        {typeMissing && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            {t.chooseType(pick(typeField.label, locale).toLowerCase(), pick(category.singular, locale).toLowerCase())}
          </p>
        )}
        <p className="text-sm text-slate-600">
          {t.untickHint} <span className="text-slate-500">{t.includedCount(standardIncluded.length, checks.length)}</span>
        </p>
        {err("checks") && <p className="text-xs font-medium text-rose-600">{err("checks")}</p>}
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="w-10 p-3 font-medium">
                  <span className="sr-only">{t.include}</span>
                </th>
                <th className="p-3 font-medium">{t.check}</th>
                <th className="p-3 font-medium">{t.result}</th>
                <th className="hidden p-3 font-medium sm:table-cell">{t.notes}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applicable.map((c) => {
                const entry = checks.find((x) => x.key === c.key)!;
                const isIncluded = !v.excludedChecks.includes(c.key);
                return (
                  <tr key={c.key} className={`align-top ${isIncluded ? "" : "bg-slate-50 text-slate-400"}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={t.includeCheck(pick(c.label, locale))}
                        className="mt-1 size-4 accent-brand-600"
                        checked={isIncluded}
                        onChange={(e) => toggleCheck(c.key, e.target.checked)}
                      />
                    </td>
                    <td className="p-3">
                      <span className="font-medium">{pick(c.label, locale)}</span>
                      {c.hint && <span className="block text-xs text-slate-500">{pick(c.hint, locale)}</span>}
                      {!isIncluded && <span className="block text-xs">{t.notIncluded}</span>}
                    </td>
                    <td className="p-3">
                      <select aria-label={t.resultOf(pick(c.label, locale))} className="input py-1" value={entry.status} disabled={!isIncluded} onChange={(e) => setCheck(c.key, { status: e.target.value as CheckStatus })}>
                        {CHECK_STATUSES.map((s) => <option key={s} value={s}>{pick(CHECK_STATUS_INFO[s].label, locale)}</option>)}
                      </select>
                    </td>
                    <td className="p-3 sm:table-cell">
                      <input
                        aria-label={t.notesOf(pick(c.label, locale))}
                        className="input py-1"
                        placeholder={entry.status === "MINOR" || entry.status === "FAIL" ? t.describeIssue : t.optional}
                        value={entry.note ?? ""}
                        maxLength={200}
                        disabled={!isIncluded}
                        onChange={(e) => setCheck(c.key, { note: e.target.value })}
                        aria-invalid={!!err(`checks.${c.key}`)}
                      />
                      {err(`checks.${c.key}`) && <p className="mt-1 text-xs text-rose-600">{err(`checks.${c.key}`)}</p>}
                    </td>
                  </tr>
                );
              })}
              {custom.map((c, i) => (
                <tr key={c.key} className="align-top">
                  <td className="p-3">
                    <button type="button" aria-label={t.removeCustom(i + 1)} className="mt-0.5 text-slate-400 hover:text-rose-600" onClick={() => removeCustomCheck(c.key)}>
                      <X className="size-4" aria-hidden />
                    </button>
                  </td>
                  <td className="p-3">
                    <input
                      aria-label={t.customName(i + 1)}
                      className="input py-1"
                      placeholder={t.customPlaceholder}
                      value={c.label ?? ""}
                      maxLength={60}
                      onChange={(e) => setCheck(c.key, { label: e.target.value })}
                    />
                    <span className="mt-1 block text-xs text-slate-500">{t.addedByYou}</span>
                  </td>
                  <td className="p-3">
                    <select aria-label={t.customResult(i + 1)} className="input py-1" value={c.status} onChange={(e) => setCheck(c.key, { status: e.target.value as CheckStatus })}>
                      {CHECK_STATUSES.map((s) => <option key={s} value={s}>{pick(CHECK_STATUS_INFO[s].label, locale)}</option>)}
                    </select>
                  </td>
                  <td className="p-3 sm:table-cell">
                    <input
                      aria-label={t.customNotes(i + 1)}
                      className="input py-1"
                      placeholder={c.status === "MINOR" || c.status === "FAIL" ? t.describeIssue : t.optional}
                      value={c.note ?? ""}
                      maxLength={200}
                      onChange={(e) => setCheck(c.key, { note: e.target.value })}
                      aria-invalid={!!err(`checks.${c.key}`)}
                    />
                    {err(`checks.${c.key}`) && <p className="mt-1 text-xs text-rose-600">{err(`checks.${c.key}`)}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={custom.length >= MAX_CUSTOM_CHECKS} onClick={addCustomCheck}>
            {t.addCustom}
          </Button>
          <span className="text-xs text-slate-500">
            {t.addCustomHint(MAX_CUSTOM_CHECKS)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.accessories} name="includedAccessories" hint={t.accessoriesHint}>
            <input id="includedAccessories" className="input" value={v.includedAccessories} onChange={(e) => set("includedAccessories", e.target.value)} />
          </Field>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-brand-600" checked={v.serialVerified} onChange={(e) => set("serialVerified", e.target.checked)} />
              {t.serialVerified}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-brand-600" checked={v.originalBox} onChange={(e) => set("originalBox", e.target.checked)} />
              {t.originalBox}
            </label>
          </div>
          <div className="sm:col-span-2">
            <Field label={t.knownIssues} name="knownIssues" error={err("knownIssues")} hint={t.knownIssuesHint}>
              <textarea id="knownIssues" rows={3} className="input" value={v.knownIssues} maxLength={1000} onChange={(e) => set("knownIssues", e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title={t.pricing}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t.price} name="price" error={err("priceIdr")} hint={t.priceRange(formatMoney(MIN_PRICE_IDR), formatMoney(MAX_PRICE_IDR))}>
            <input id="price" inputMode="numeric" placeholder={t.pricePlaceholder} className="input" value={v.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label={t.originalPrice} name="originalPrice" error={err("originalPriceIdr")}>
            <input id="originalPrice" inputMode="numeric" className="input" value={v.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} />
          </Field>
          <Field label={t.shipping} name="shipping" error={err("shippingIdr")} hint={t.shippingHint}>
            <input id="shipping" inputMode="numeric" className="input" value={v.shipping} onChange={(e) => set("shipping", e.target.value)} />
          </Field>
          <Field label={t.warranty} name="warrantyType" error={err("warrantyType")}>
            <select id="warrantyType" className="input" value={v.warrantyType} onChange={(e) => set("warrantyType", e.target.value)}>
              {WARRANTY_TYPES.map((w) => <option key={w} value={w}>{pick(WARRANTY_INFO[w], locale)}</option>)}
            </select>
          </Field>
          {v.warrantyType !== "NONE" && (
            <Field label={t.warrantyMonths} name="warrantyMonths" error={err("warrantyMonths")}>
              <input id="warrantyMonths" type="number" min={1} max={36} className="input" value={v.warrantyMonths} onChange={(e) => set("warrantyMonths", e.target.value)} />
            </Field>
          )}
          <Field label={t.returnWindow} name="returnWindowDays" error={err("returnWindowDays")} hint={t.returnWindowHint}>
            <input id="returnWindowDays" type="number" min={0} max={30} className="input" value={v.returnWindowDays} onChange={(e) => set("returnWindowDays", e.target.value)} />
          </Field>
          <label className="flex items-start gap-3 rounded-lg border border-rule p-3 text-sm sm:col-span-3">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={v.acceptsOffers} onChange={(e) => set("acceptsOffers", e.target.checked)} />
            <span>
              <span className="block font-semibold text-ink">{t.acceptOffers}</span>
              <span className="text-slate-600">{t.acceptOffersHint}</span>
            </span>
          </label>
          {v.warrantyType !== "NONE" && (
            <div className="sm:col-span-3">
              <Field label={t.warrantyTerms} name="warrantyTerms" error={err("warrantyTerms")} hint={t.warrantyTermsHint}>
                <textarea id="warrantyTerms" rows={3} className="input" value={v.warrantyTerms} maxLength={1000} onChange={(e) => set("warrantyTerms", e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      </Section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-surface/95 p-4 shadow-lg backdrop-blur">
        <p className="mr-auto max-w-xl text-xs text-slate-600">
          <RichText text={t.publishNote} newTab />
        </p>
        <Button type="button" variant="secondary" disabled={saving || uploading > 0} onClick={() => submit(false)}>
          {t.saveDraft}
        </Button>
        <Button type="submit" disabled={saving || uploading > 0}>
          {saving ? t.saving : t.publish}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="text-sm text-slate-600">{description}</p>}
      </div>
      {children}
    </section>
  );
}
