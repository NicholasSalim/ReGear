"use client";

import { useSyncExternalStore } from "react";
import { GitCompareArrows, X } from "lucide-react";
import { Link, useLocale, useT } from "@/i18n/client";
import { localePath } from "@/i18n/locales";
import { MAX_COMPARE } from "@/lib/constants";

// Comparison list kept in localStorage (no server state needed) and shared
// between every card on the page through a tiny external store.
type Item = { id: string; title: string; category: string };
const KEY = "regear:compare";
const listeners = new Set<() => void>();
let cache: Item[] | null = null;
// True once this page view has changed the list. The tray also mounts on page
// load when items are already saved, and shouldn't look like it just arrived.
let changedThisView = false;
const EMPTY: Item[] = [];

function read(): Item[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed)
      ? parsed
          .filter((i) => i && typeof i.id === "string" && /^[a-z0-9]{20,32}$/i.test(i.id))
          .slice(0, MAX_COMPARE)
          .map((i) => ({ id: i.id, title: String(i.title).slice(0, 120), category: String(i.category).slice(0, 40) }))
      : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(items: Item[]) {
  changedThisView = true;
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

function useCompare() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function CompareToggle({ id, title, category }: Item) {
  const items = useCompare();
  const t = useT();
  const selected = items.some((i) => i.id === id);
  const full = items.length >= MAX_COMPARE;

  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 select-none">
      <input
        type="checkbox"
        className="size-4 rounded border-slate-300 accent-brand-600"
        checked={selected}
        disabled={!selected && full}
        onChange={() => write(selected ? items.filter((i) => i.id !== id) : [...items, { id, title, category }])}
      />
      {selected ? t.compare.added : full ? t.compare.full(MAX_COMPARE) : t.compare.compare}
    </label>
  );
}

export function CompareTray() {
  const items = useCompare();
  const t = useT();
  if (items.length === 0) return null;
  const mixed = new Set(items.map((i) => i.category)).size > 1;

  return (
    <div className={`fixed inset-x-0 bottom-4 z-40 px-4 ${changedThisView ? "compare-tray-enter" : ""}`} role="region" aria-label={t.compare.trayAria}>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl bg-inverse px-4 py-3 text-white shadow-2xl">
        <GitCompareArrows className="size-5 shrink-0 text-white/70" aria-hidden />
        <ul className="flex min-w-0 flex-1 flex-wrap gap-2 max-sm:hidden">
          {items.map((i) => (
            <li key={i.id} className="flex max-w-[12rem] items-center gap-1 rounded-full bg-white/10 py-1 pr-1 pl-3 text-xs">
              <span className="truncate">{i.title}</span>
              <button
                type="button"
                onClick={() => write(items.filter((x) => x.id !== i.id))}
                className="rounded-full p-0.5 hover:bg-white/20"
                aria-label={t.compare.remove(i.title)}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        {mixed && <span className="text-xs text-amber-300 max-sm:hidden">{t.compare.mixed}</span>}
        <button type="button" onClick={() => write([])} className="text-xs text-white/70 hover:text-white max-sm:ml-auto">
          {t.compare.clear}
        </button>
        <Link
          href={`/compare?ids=${items.map((i) => i.id).join(",")}`}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${items.length < 2 ? "pointer-events-none bg-white/20 text-white/60" : "bg-brand-500 hover:bg-brand-600"}`}
          aria-disabled={items.length < 2}
        >
          {t.compare.compareCount(items.length)}
        </Link>
      </div>
    </div>
  );
}

/** Removes one item from the comparison on screen, which may be a shared link rather than this browser's own list. */
export function RemoveFromCompare({ id, shown }: { id: string; shown: string[] }) {
  const items = useCompare();
  const t = useT();
  const locale = useLocale();
  return (
    <button
      type="button"
      className="text-xs text-slate-500 underline hover:text-rose-600"
      onClick={() => {
        const next = shown.filter((other) => other !== id);
        write(items.filter((i) => i.id !== id));
        window.location.assign(localePath(next.length ? `/compare?ids=${next.join(",")}` : "/compare", locale));
      }}
    >
      {t.compare.removeOne}
    </button>
  );
}
