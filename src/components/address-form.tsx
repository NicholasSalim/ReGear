"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { FormMessage, SubmitButton, useActionForm } from "@/components/forms";
import { Button, Field } from "@/components/ui";
import type { LatLng } from "@/components/location-picker";

// The map (Leaflet) only loads when the buyer chooses to add a pin.
const LocationPicker = dynamic(() => import("@/components/location-picker").then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-slate-100 sm:h-72" />,
});

type Region = { code: string; name: string };

export type AddressFormValues = {
  label: string;
  recipientName: string;
  phone: string;
  provinceCode: string;
  cityCode: string;
  districtCode: string;
  district?: string;
  city?: string;
  postalCode: string;
  street: string;
  detail: string;
  note: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
};

/** One level of the region list, loaded when its parent is chosen. */
function useRegions(parent: string | null) {
  const [regions, setRegions] = useState<Region[]>([]);
  useEffect(() => {
    if (parent === null) return;
    let cancelled = false;
    fetch(`/api/regions${parent ? `?parent=${encodeURIComponent(parent)}` : ""}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Region[]) => !cancelled && setRegions(list))
      .catch(() => !cancelled && setRegions([]));
    return () => {
      cancelled = true;
    };
  }, [parent]);
  return parent === null ? [] : regions;
}

export function AddressForm({
  action,
  initial,
  defaultName,
  onSaved,
  onCancel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: AddressFormValues;
  defaultName?: string;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const { state, pending, formProps } = useActionForm(action);
  const t = useT().address;
  const [label, setLabel] = useState(initial?.label ?? t.labels[0]);
  const [provinceCode, setProvinceCode] = useState(initial?.provinceCode ?? "");
  const [cityCode, setCityCode] = useState(initial?.cityCode ?? "");
  const [districtCode, setDistrictCode] = useState(initial?.districtCode ?? "");
  const [pin, setPin] = useState<LatLng | null>(initial?.latitude != null && initial.longitude != null ? { lat: initial.latitude, lng: initial.longitude } : null);
  const [showMap, setShowMap] = useState(pin !== null);

  const provinces = useRegions("");
  const cities = useRegions(provinceCode || null);
  const districts = useRegions(cityCode || null);

  useEffect(() => {
    if (state.ok && state.id) onSaved?.(state.id);
    // Only when a save succeeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const err = state.fieldErrors ?? {};
  const districtName = districts.find((d) => d.code === districtCode)?.name ?? initial?.district;
  const cityName = cities.find((c) => c.code === cityCode)?.name ?? initial?.city;
  const select = "input";

  return (
    <form {...formProps} className="space-y-4">
      <FormMessage state={state} />

      <Field label={t.label} name="label" error={err.label}>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {t.labels.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLabel(l)}
                aria-pressed={label === l}
                className={`rounded-full px-3 py-1 text-sm ring-1 ${label === l ? "bg-brand-50 font-semibold text-brand-800 ring-brand-300" : "text-slate-700 ring-slate-200 hover:ring-slate-400"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <input id="label" name="label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} className="input" aria-invalid={!!err.label} />
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t.recipientName} name="recipientName" error={err.recipientName}>
          <input id="recipientName" name="recipientName" autoComplete="name" defaultValue={initial?.recipientName ?? defaultName} maxLength={100} className="input" aria-invalid={!!err.recipientName} />
        </Field>
        <Field label={t.phone} name="phone" error={err.phone} hint={t.phoneHint}>
          <input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={initial?.phone} maxLength={20} className="input" aria-invalid={!!err.phone} />
        </Field>

        <Field label={t.province} name="provinceCode" error={err.provinceCode}>
          <select
            id="provinceCode"
            name="provinceCode"
            value={provinceCode}
            onChange={(e) => {
              setProvinceCode(e.target.value);
              setCityCode("");
              setDistrictCode("");
            }}
            className={select}
            aria-invalid={!!err.provinceCode}
          >
            <option value="">{t.choose}</option>
            {provinces.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t.city} name="cityCode" error={err.cityCode}>
          <select
            id="cityCode"
            name="cityCode"
            value={cityCode}
            disabled={!provinceCode}
            onChange={(e) => {
              setCityCode(e.target.value);
              setDistrictCode("");
            }}
            className={select}
            aria-invalid={!!err.cityCode}
          >
            <option value="">{t.choose}</option>
            {cities.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t.district} name="districtCode" error={err.districtCode}>
          <select id="districtCode" name="districtCode" value={districtCode} disabled={!cityCode} onChange={(e) => setDistrictCode(e.target.value)} className={select} aria-invalid={!!err.districtCode}>
            <option value="">{t.choose}</option>
            {districts.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t.postalCode} name="postalCode" error={err.postalCode}>
          <input id="postalCode" name="postalCode" inputMode="numeric" autoComplete="postal-code" defaultValue={initial?.postalCode} maxLength={5} className="input num" aria-invalid={!!err.postalCode} />
        </Field>

        <div className="sm:col-span-2">
          <Field label={t.street} name="street" error={err.street} hint={t.streetHint}>
            <textarea id="street" name="street" autoComplete="street-address" rows={2} defaultValue={initial?.street} maxLength={200} className="input" aria-invalid={!!err.street} />
          </Field>
        </div>
        <Field label={t.detail} name="detail" error={err.detail}>
          <input id="detail" name="detail" defaultValue={initial?.detail} placeholder={t.detailPlaceholder} maxLength={100} className="input" aria-invalid={!!err.detail} />
        </Field>
        <Field label={t.note} name="note" error={err.note}>
          <input id="note" name="note" defaultValue={initial?.note} placeholder={t.notePlaceholder} maxLength={150} className="input" aria-invalid={!!err.note} />
        </Field>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="size-4 text-brand-700" aria-hidden /> {t.pinTitle}
          </p>
          {!showMap && (
            <Button type="button" variant="secondary" className="px-3 py-1.5" onClick={() => setShowMap(true)}>
              {t.addPin}
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-600">{t.pinHint}</p>
        {showMap && <LocationPicker value={pin} onChange={setPin} searchHint={[districtName, cityName].filter(Boolean).join(", ")} />}
        {err.latitude && <p className="text-xs font-medium text-rose-600">{err.latitude}</p>}
        <input type="hidden" name="latitude" value={pin?.lat ?? ""} />
        <input type="hidden" name="longitude" value={pin?.lng ?? ""} />
      </div>

      {!initial?.isDefault && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="makeDefault" className="size-4 accent-brand-600" />
          {t.makeDefault}
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingText={t.saving}>
          {t.save}
        </SubmitButton>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
