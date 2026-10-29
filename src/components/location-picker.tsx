"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useT } from "@/i18n/client";
import { buttonClass } from "@/components/ui";

// The optional delivery pin: an OpenStreetMap map (Leaflet) with a draggable
// marker. Tap the map or drag the pin, search for a place (OpenStreetMap's
// Nominatim, one request per search as its usage policy asks), or use the
// device's location. Leaflet only runs in the browser, so it loads on demand.

export type LatLng = { lat: number; lng: number };

const INDONESIA: LatLng = { lat: -2.5, lng: 118 };
// Close enough to see the street, far enough to see the neighbourhood.
const STREET_ZOOM = 17;
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

const PIN_HTML =
  '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="#2340d9" stroke="#fff" stroke-width="1.5" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>';

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function LocationPicker({
  value,
  onChange,
  searchHint,
}: {
  value: LatLng | null;
  onChange: (value: LatLng | null) => void;
  /** Text to search for when the map opens without a pin, e.g. the chosen district and city. */
  searchHint?: string;
}) {
  const t = useT().address;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"search" | "locate" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !container.current || map.current) return;
      const m = L.map(container.current, { zoomControl: true, attributionControl: true }).setView(
        value ?? INDONESIA,
        value ? STREET_ZOOM : 5,
      );
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
      const icon = L.divIcon({ html: PIN_HTML, className: "", iconSize: [36, 36], iconAnchor: [18, 34] });
      const place = (p: LatLng) => {
        const at = { lat: round(p.lat), lng: round(p.lng) };
        if (marker.current) marker.current.setLatLng(at);
        else {
          marker.current = L.marker(at, { icon, draggable: true, keyboard: true, title: t.dragPin }).addTo(m);
          marker.current.on("dragend", () => {
            const ll = marker.current!.getLatLng();
            onChangeRef.current({ lat: round(ll.lat), lng: round(ll.lng) });
          });
        }
        onChangeRef.current(at);
      };
      if (value) place(value);
      m.on("click", (e) => place(e.latlng));
      map.current = m;
      (m as LeafletMap & { placePin?: (p: LatLng) => void }).placePin = place;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is created once; later pins go through placePin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placePin(p: LatLng, zoom = STREET_ZOOM) {
    const m = map.current as (LeafletMap & { placePin?: (p: LatLng) => void }) | null;
    if (!m?.placePin) return;
    m.placePin(p);
    m.setView(p, Math.max(m.getZoom(), zoom));
  }

  async function search(text: string) {
    const q = text.trim();
    if (q.length < 3) return;
    setBusy("search");
    setProblem(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=id&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const results = (await res.json()) as { lat: string; lon: string }[];
      if (!results[0]) setProblem(t.notFound);
      else placePin({ lat: Number(results[0].lat), lng: Number(results[0].lon) }, 16);
    } catch {
      setProblem(t.searchFailed);
    } finally {
      setBusy(null);
    }
  }

  function locate() {
    if (!navigator.geolocation) return setProblem(t.locateFailed);
    setBusy("locate");
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        placePin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setBusy(null);
        setProblem(t.locateFailed);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search(query);
              }
            }}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            className="input min-w-0 flex-1"
          />
          <button type="button" onClick={() => search(query || searchHint || "")} className={buttonClass("secondary", "px-3")} disabled={busy !== null}>
            {busy === "search" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            <span className="sr-only sm:not-sr-only">{t.search}</span>
          </button>
        </div>
        <button type="button" onClick={locate} className={buttonClass("secondary", "px-3")} disabled={busy !== null}>
          {busy === "locate" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Crosshair className="size-4" aria-hidden />}
          {t.useMyLocation}
        </button>
      </div>
      <div ref={container} className="h-64 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 sm:h-72" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {value ? t.pinned(value.lat.toFixed(5), value.lng.toFixed(5)) : t.tapToPin}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => {
              marker.current?.remove();
              marker.current = null;
              onChange(null);
            }}
            className="flex items-center gap-1 font-medium text-rose-700 hover:underline"
          >
            <X className="size-3.5" aria-hidden /> {t.removePin}
          </button>
        )}
      </div>
      {problem && <p className="text-xs font-medium text-rose-600">{problem}</p>}
    </div>
  );
}
