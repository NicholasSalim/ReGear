"use client";

import Image from "next/image";
import { useEffect, useSyncExternalStore } from "react";
import { Link } from "@/i18n/client";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";

// Listings this browser has opened, newest first. Kept in localStorage like the
// comparison list: it's only for this visitor, so no server state is needed.
type Viewed = { slug: string; title: string; image: string | null; price: number };
const KEY = "regear:recent";
const LIMIT = 12;
const listeners = new Set<() => void>();
let cache: Viewed[] | null = null;
const EMPTY: Viewed[] = [];

function read(): Viewed[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed)
      ? parsed
          .filter((v) => v && typeof v.slug === "string" && /^[a-z0-9-]{1,200}$/.test(v.slug) && typeof v.price === "number")
          .slice(0, LIMIT)
          .map((v) => ({
            slug: v.slug,
            title: String(v.title).slice(0, 120),
            image: typeof v.image === "string" && /^[\w./-]{1,200}$/.test(v.image) && !v.image.includes("..") ? v.image : null,
            price: v.price,
          }))
      : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(items: Viewed[]) {
  cache = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Put on a listing page: notes the visit so the home page can offer the listing again. */
export function RecordView(item: Viewed) {
  const { slug, title, image, price } = item;
  useEffect(() => {
    write([{ slug, title, image, price }, ...read().filter((v) => v.slug !== slug)].slice(0, LIMIT));
  }, [slug, title, image, price]);
  return null;
}

/**
 * The listings this browser has viewed. On the home page and in My ReGear's
 * summary it's a shelf that only appears once something has been viewed; on
 * its own page ("page") it shows everything, or `empty` when there's nothing.
 */
export function RecentlyViewed({
  title,
  clear,
  variant = "home",
  empty,
}: {
  title: string;
  clear: string;
  variant?: "home" | "panel" | "page";
  empty?: React.ReactNode;
}) {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  if (!items.length) return variant === "page" ? empty : null;
  // One full row: six across on the home page, five in My ReGear's narrower column.
  const shown = variant === "page" ? items : items.slice(0, variant === "panel" ? 5 : 6);
  return (
    <section className={variant === "home" ? "container-page pt-12" : variant === "panel" ? "mt-10" : ""} aria-labelledby="recently-viewed">
      <div className={`flex items-end justify-between gap-4 ${variant === "home" ? "mb-5" : "mb-3"}`}>
        <h2 id="recently-viewed" className={variant === "home" ? "text-2xl font-extrabold" : variant === "panel" ? "text-lg font-bold" : "sr-only"}>
          {title}
        </h2>
        <button type="button" onClick={() => write([])} className="ml-auto shrink-0 text-sm font-semibold text-brand-700 hover:underline">
          {clear}
        </button>
      </div>
      <ul className={`grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 ${variant === "home" ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        {shown.map((v) => (
          <li key={v.slug} className="group relative">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-plate">
              {v.image && <Image src={mediaUrl(v.image)} alt="" fill sizes="(min-width: 1024px) 200px, 30vw" className="object-cover" />}
            </div>
            <Link href={`/listings/${v.slug}`} className="mt-2 line-clamp-2 text-sm leading-snug text-ink after:absolute after:inset-0 group-hover:underline">
              {v.title}
            </Link>
            <p className="num mt-0.5 text-sm font-bold text-ink">{formatMoney(v.price)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
