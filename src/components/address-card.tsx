"use client";

import { MapPin } from "lucide-react";
import { useT } from "@/i18n/client";
import { addressLines, mapsUrl } from "@/lib/address-format";
import type { AddressFormValues } from "@/components/address-form";

export type BookAddress = AddressFormValues & { id: string; province: string; city: string; district: string };

/** A saved address as a card; children go at the bottom (actions, or a radio at checkout). */
export function AddressCard({ address: a, children, selected }: { address: BookAddress; children?: React.ReactNode; selected?: boolean }) {
  const t = useT().address;
  return (
    <div className={`card space-y-2 p-5 text-sm ${selected ? "ring-2 ring-brand-500" : ""}`}>
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{a.label}</span>
        {a.isDefault && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-800">{t.default}</span>}
      </p>
      <p className="font-medium">
        {a.recipientName} <span className="font-normal text-slate-600">· {a.phone}</span>
      </p>
      <address className="text-slate-700 not-italic">
        {addressLines(a).map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </address>
      {a.note && <p className="text-xs text-slate-600">{t.notePrefix(a.note)}</p>}
      {a.latitude != null && a.longitude != null ? (
        <a href={mapsUrl(a.latitude, a.longitude)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
          <MapPin className="size-3.5" aria-hidden /> {t.pinSet}
        </a>
      ) : (
        <p className="text-xs text-slate-500">{t.noPin}</p>
      )}
      {children}
    </div>
  );
}
