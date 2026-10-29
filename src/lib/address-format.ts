// How an address is written out, the same everywhere (address book,
// checkout, the seller's packing view). Accepts a saved address or an
// order's snapshot; snapshots from before the address book have no district,
// note or pin, and may name a country other than Indonesia.

export type AddressLike = {
  street?: string;
  line1?: string;
  detail?: string;
  line2?: string;
  district?: string;
  city?: string;
  province?: string;
  region?: string;
  postalCode?: string;
  country?: string;
};

/** The address as lines, from street down to province and postcode. */
export function addressLines(a: AddressLike): string[] {
  const street = a.street ?? a.line1 ?? "";
  const detail = a.detail ?? a.line2 ?? "";
  const province = a.province ?? a.region ?? "";
  const lines = [
    [street, detail].filter(Boolean).join(", "),
    [a.district, a.city].filter(Boolean).join(", "),
    [province, a.postalCode].filter(Boolean).join(" "),
  ];
  if (a.country && a.country !== "Indonesia") lines.push(a.country);
  return lines.filter(Boolean);
}

/** A link that opens the pin in Google Maps (no API key needed; opens the app on phones). */
export function mapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
