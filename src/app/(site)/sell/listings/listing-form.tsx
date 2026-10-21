"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, X } from "lucide-react";
import { saveListingAction } from "@/actions/listings";
import { CATEGORIES, getCategory } from "@/lib/catalog";
import { functionalScore, type ConditionCheckEntry } from "@/lib/condition";
import {
  CHECK_STATUS_INFO,
  CHECK_STATUSES,
  CONDITION_GRADES,
  GRADE_INFO,
  MAX_LISTING_IMAGES,
  WARRANTY_INFO,
  WARRANTY_TYPES,
  type CheckStatus,
} from "@/lib/constants";
import { Button, Field } from "@/components/ui";
import type { ListingFormValues } from "./listing-form-values";

export function ListingForm({ listingId, initial }: { listingId: string | null; initial: ListingFormValues }) {
  const router = useRouter();
  const [v, setV] = useState<ListingFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [saving, startSaving] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const category = getCategory(v.category)!;
  const checks = useMemo(
    () => category.checks.map((c) => v.checks.find((x) => x.key === c.key) ?? { key: c.key, status: "PASS" as CheckStatus, note: "" }),
    [category, v.checks],
  );
  const score = functionalScore(checks);

  const set = <K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const setSpec = (key: string, value: string | boolean) => setV((prev) => ({ ...prev, specs: { ...prev.specs, [key]: value } }));
  const setCheck = (key: string, patch: Partial<ConditionCheckEntry>) =>
    setV((prev) => ({ ...prev, checks: checks.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));

  async function uploadFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_LISTING_IMAGES - v.images.length;
    const batch = Array.from(files).slice(0, room);
    setFormError(null);
    for (const file of batch) {
      if (file.size > 8 * 1024 * 1024) {
        setFormError(`${file.name} is larger than 8MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body });
        const json = await res.json();
        if (!res.ok) setFormError(json.error ?? "Upload failed");
        else setV((prev) => ({ ...prev, images: [...prev.images, { id: json.id, url: json.url }].slice(0, MAX_LISTING_IMAGES) }));
      } catch {
        setFormError("Upload failed. Check your connection.");
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
    const payload = {
      title: v.title,
      category: v.category,
      brand: v.brand,
      model: v.model,
      description: v.description,
      priceCents: v.price,
      originalPriceCents: v.originalPrice || null,
      shippingCents: v.shipping || "0",
      location: v.location,
      conditionGrade: v.conditionGrade,
      warrantyType: v.warrantyType,
      warrantyMonths: v.warrantyMonths || "0",
      warrantyTerms: v.warrantyTerms,
      returnWindowDays: v.returnWindowDays || "0",
      specs: Object.fromEntries(category.specFields.map((f) => [f.key, v.specs[f.key] ?? ""])),
      batteryHealth: category.hasBattery && v.batteryHealth ? v.batteryHealth : null,
      cosmeticScore: v.cosmeticScore,
      checks: checks.map((c) => ({ key: c.key, status: c.status, note: c.note || undefined })),
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
        router.push("/sell/listings");
        router.refresh();
        return;
      }
      setFormError(res.error ?? "Could not save the listing.");
      setErrors(res.fieldErrors ?? {});
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const err = (k: string) => errors[k];

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
          {Object.keys(errors).length > 0 && (
            <span className="mt-1 block text-xs">
              {Object.values(errors)
                .slice(0, 5)
                .map((m, i) => (
                  <span key={i} className="block">• {m}</span>
                ))}
            </span>
          )}
        </p>
      )}

      <Section title="Photos" description={`Up to ${MAX_LISTING_IMAGES} photos. Show every angle and any flaws mentioned in the report. The first photo is the cover.`}>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {v.images.map((img, i) => (
            <li key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <Image src={img.url} alt={`Photo ${i + 1}`} fill sizes="160px" className="object-cover" />
              {i === 0 && <span className="absolute top-1 left-1 rounded bg-ink/80 px-1.5 text-[10px] font-semibold text-white">Cover</span>}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/60 p-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                <button type="button" onClick={() => moveImage(i, -1)} className="rounded p-1 text-white hover:bg-white/20" aria-label="Move left"><ArrowLeft className="size-3.5" /></button>
                <button type="button" onClick={() => set("images", v.images.filter((x) => x.id !== img.id))} className="rounded p-1 text-white hover:bg-white/20" aria-label="Remove photo"><X className="size-3.5" /></button>
                <button type="button" onClick={() => moveImage(i, 1)} className="rounded p-1 text-white hover:bg-white/20" aria-label="Move right"><ArrowRight className="size-3.5" /></button>
              </div>
            </li>
          ))}
          {v.images.length < MAX_LISTING_IMAGES && (
            <li>
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-500 hover:text-brand-700">
                {uploading > 0 ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
                {uploading > 0 ? "Uploading…" : "Add photos"}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={(e) => uploadFiles(e.target.files)} />
              </label>
            </li>
          )}
        </ul>
        {err("imageIds") && <p className="text-xs font-medium text-rose-600">{err("imageIds")}</p>}
      </Section>

      <Section title="The basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title" name="title" error={err("title")} hint="e.g. iPhone 14 Pro 256GB Deep Purple — unlocked">
              <input id="title" className="input" value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
            </Field>
          </div>
          <Field label="Category" name="category" error={err("category")}>
            <select id="category" className="input" value={v.category} onChange={(e) => setV((p) => ({ ...p, category: e.target.value, checks: [], specs: {} }))}>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Brand" name="brand" error={err("brand")}>
            <input id="brand" className="input" value={v.brand} maxLength={40} onChange={(e) => set("brand", e.target.value)} />
          </Field>
          <Field label="Model" name="model" error={err("model")}>
            <input id="model" className="input" value={v.model} maxLength={80} onChange={(e) => set("model", e.target.value)} />
          </Field>
          <Field label="Ships from (city)" name="location" error={err("location")}>
            <input id="location" className="input" value={v.location} maxLength={80} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" name="description" error={err("description")} hint="History, reason for selling, usage. At least 30 characters.">
              <textarea id="description" rows={5} className="input" value={v.description} maxLength={5000} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title={`${category.singular} specifications`} description="Structured specs power search filters and side-by-side comparison.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {category.specFields.map((f) => {
            const id = `spec-${f.key}`;
            const value = v.specs[f.key];
            const label = `${f.label}${f.unit ? ` (${f.unit})` : ""}${f.required ? " *" : ""}`;
            if (f.type === "boolean") {
              return (
                <label key={f.key} className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={value === true} onChange={(e) => setSpec(f.key, e.target.checked)} />
                  {f.label}
                </label>
              );
            }
            return (
              <Field key={f.key} label={label} name={id} error={err(`specs.${f.key}`)}>
                {f.type === "select" ? (
                  <select id={id} className="input" value={String(value ?? "")} onChange={(e) => setSpec(f.key, e.target.value)}>
                    <option value="">—</option>
                    {f.options?.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    id={id}
                    className="input"
                    type={f.type === "number" ? "number" : "text"}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    min={f.type === "number" ? 0 : undefined}
                    placeholder={f.placeholder}
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

      <Section title="Condition report" description="Be precise: buyers can return or dispute items that don't match this report.">
        <fieldset>
          <legend className="label">Overall grade</legend>
          <div className="grid gap-2 sm:grid-cols-5">
            {CONDITION_GRADES.map((g) => (
              <label key={g} className={`cursor-pointer rounded-lg border p-3 text-sm ${v.conditionGrade === g ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                <input type="radio" name="conditionGrade" value={g} checked={v.conditionGrade === g} onChange={() => set("conditionGrade", g)} className="sr-only" />
                <span className="block font-semibold">{GRADE_INFO[g].label}</span>
                <span className="mt-1 block text-xs text-slate-500">{GRADE_INFO[g].summary}</span>
              </label>
            ))}
          </div>
          {err("conditionGrade") && <p className="mt-1 text-xs font-medium text-rose-600">{err("conditionGrade")}</p>}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          {category.hasBattery && (
            <Field label="Battery health (%)" name="batteryHealth" error={err("batteryHealth")} hint="From Settings → Battery or a diagnostic tool.">
              <input id="batteryHealth" type="number" min={1} max={100} className="input" value={v.batteryHealth} onChange={(e) => set("batteryHealth", e.target.value)} />
            </Field>
          )}
          <Field label="Cosmetic score (1–10)" name="cosmeticScore" error={err("cosmeticScore")}>
            <input id="cosmeticScore" type="number" min={1} max={10} className="input" value={v.cosmeticScore} onChange={(e) => set("cosmeticScore", e.target.value)} />
          </Field>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Functional score (auto)</p>
            <p className="text-2xl font-bold">{score}/100</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="p-3 font-medium">Check</th>
                <th className="p-3 font-medium">Result</th>
                <th className="hidden p-3 font-medium sm:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {category.checks.map((c) => {
                const entry = checks.find((x) => x.key === c.key)!;
                return (
                  <tr key={c.key} className="align-top">
                    <td className="p-3">
                      <span className="font-medium">{c.label}</span>
                      {c.hint && <span className="block text-xs text-slate-500">{c.hint}</span>}
                    </td>
                    <td className="p-3">
                      <select aria-label={`${c.label} result`} className="input py-1" value={entry.status} onChange={(e) => setCheck(c.key, { status: e.target.value as CheckStatus })}>
                        {CHECK_STATUSES.map((s) => <option key={s} value={s}>{CHECK_STATUS_INFO[s].label}</option>)}
                      </select>
                    </td>
                    <td className="p-3 sm:table-cell">
                      <input
                        aria-label={`${c.label} notes`}
                        className="input py-1"
                        placeholder={entry.status === "MINOR" || entry.status === "FAIL" ? "Describe the issue (required)" : "Optional"}
                        value={entry.note ?? ""}
                        maxLength={200}
                        onChange={(e) => setCheck(c.key, { note: e.target.value })}
                        aria-invalid={!!err(`checks.${c.key}`)}
                      />
                      {err(`checks.${c.key}`) && <p className="mt-1 text-xs text-rose-600">{err(`checks.${c.key}`)}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Included accessories" name="includedAccessories" hint="Comma separated, e.g. charger, case, original cable">
            <input id="includedAccessories" className="input" value={v.includedAccessories} onChange={(e) => set("includedAccessories", e.target.value)} />
          </Field>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-brand-600" checked={v.serialVerified} onChange={(e) => set("serialVerified", e.target.checked)} />
              I checked the serial/IMEI is not reported lost, stolen or blacklisted
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-brand-600" checked={v.originalBox} onChange={(e) => set("originalBox", e.target.checked)} />
              Comes with original box
            </label>
          </div>
          <div className="sm:col-span-2">
            <Field label="Known issues" name="knownIssues" error={err("knownIssues")} hint="Anything a buyer should know that isn't covered above.">
              <textarea id="knownIssues" rows={3} className="input" value={v.knownIssues} maxLength={1000} onChange={(e) => set("knownIssues", e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Price, warranty & returns">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price" name="price" error={err("priceCents")}>
            <input id="price" type="number" min={1} step="0.01" inputMode="decimal" className="input" value={v.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label="Original retail price (optional)" name="originalPrice" error={err("originalPriceCents")}>
            <input id="originalPrice" type="number" min={0} step="0.01" inputMode="decimal" className="input" value={v.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} />
          </Field>
          <Field label="Shipping cost" name="shipping" error={err("shippingCents")} hint="0 for free shipping">
            <input id="shipping" type="number" min={0} step="0.01" inputMode="decimal" className="input" value={v.shipping} onChange={(e) => set("shipping", e.target.value)} />
          </Field>
          <Field label="Warranty" name="warrantyType" error={err("warrantyType")}>
            <select id="warrantyType" className="input" value={v.warrantyType} onChange={(e) => set("warrantyType", e.target.value)}>
              {WARRANTY_TYPES.map((w) => <option key={w} value={w}>{WARRANTY_INFO[w]}</option>)}
            </select>
          </Field>
          {v.warrantyType !== "NONE" && (
            <Field label="Warranty length (months)" name="warrantyMonths" error={err("warrantyMonths")}>
              <input id="warrantyMonths" type="number" min={1} max={36} className="input" value={v.warrantyMonths} onChange={(e) => set("warrantyMonths", e.target.value)} />
            </Field>
          )}
          <Field label="Return window (days)" name="returnWindowDays" error={err("returnWindowDays")} hint="0–30 days after delivery">
            <input id="returnWindowDays" type="number" min={0} max={30} className="input" value={v.returnWindowDays} onChange={(e) => set("returnWindowDays", e.target.value)} />
          </Field>
          {v.warrantyType !== "NONE" && (
            <div className="sm:col-span-3">
              <Field label="Warranty terms" name="warrantyTerms" error={err("warrantyTerms")} hint="What is covered, how to claim, exclusions.">
                <textarea id="warrantyTerms" rows={3} className="input" value={v.warrantyTerms} maxLength={1000} onChange={(e) => set("warrantyTerms", e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      </Section>

      <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <Button type="button" variant="secondary" disabled={saving || uploading > 0} onClick={() => submit(false)}>
          Save draft
        </Button>
        <Button type="submit" disabled={saving || uploading > 0}>
          {saving ? "Saving…" : "Publish listing"}
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
