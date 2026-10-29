import { MapPin } from "lucide-react";
import { getDictionary } from "@/i18n/server";
import { addressLines, mapsUrl } from "@/lib/address-format";
import type { ShippingAddress } from "@/lib/addresses";

/**
 * Where an order goes, as the seller packs it: recipient, phone, the address
 * lines, the courier note, and the pin as a Google Maps link (which opens
 * the Maps app on a phone). Works for orders from before the address book.
 */
export async function ShippingAddressBlock({ address }: { address: Partial<ShippingAddress> }) {
  const t = (await getDictionary()).orders;
  const lines = addressLines(address);
  if (!address.fullName && lines.length === 0) return <p className="text-slate-500">{t.addressRemoved}</p>;
  const pinned = typeof address.latitude === "number" && typeof address.longitude === "number";
  return (
    <div className="space-y-2">
      <address className="text-slate-700 not-italic">
        {address.fullName && <span className="block font-semibold text-ink">{address.fullName}</span>}
        {address.phone && <span className="num block">{address.phone}</span>}
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </address>
      {address.note && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{t.courierNote(address.note)}</p>}
      {pinned && (
        <a
          href={mapsUrl(address.latitude!, address.longitude!)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
        >
          <MapPin className="size-3.5" aria-hidden /> {t.openInMaps}
        </a>
      )}
    </div>
  );
}
