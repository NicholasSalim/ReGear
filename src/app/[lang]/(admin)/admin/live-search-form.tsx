"use client";

import { useRef, type ReactNode } from "react";
import { useLocale } from "@/i18n/client";
import { localePath } from "@/i18n/locales";
import { useLiveSearch } from "@/components/live-search";

const FIELDS = ["q", "status", "from", "to"] as const;

/**
 * The admin search form, searching as you type. Text waits for a pause in
 * typing; the status and dates apply as soon as they change. It stays a GET
 * form, so Enter and browsers without JavaScript still submit it normally.
 */
export function LiveSearchForm({ path, searchingLabel, children }: { path: string; searchingLabel: string; children: ReactNode }) {
  const locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const { pending, go, goLater } = useLiveSearch();

  // The search in the form now, as a URL. Changing it always goes back to page 1.
  function target() {
    const data = new FormData(form.current!);
    const params = new URLSearchParams();
    for (const field of FIELDS) {
      const value = String(data.get(field) ?? "").trim();
      if (value) params.set(field, value);
    }
    const query = params.toString();
    return `${localePath(path, locale)}${query ? `?${query}` : ""}`;
  }

  return (
    <form
      ref={form}
      method="get"
      role="search"
      aria-busy={pending}
      className="card relative mb-4 flex flex-wrap items-end gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        go(target());
      }}
      onInput={(e) => {
        const field = e.target as { name?: string; value?: string };
        if (field.name === "q") goLater(target(), field.value ?? "");
      }}
      onChange={(e) => {
        // React's onChange also fires per keystroke in the text box; that one waits for a pause (onInput).
        if ((e.target as { name?: string }).name !== "q") go(target());
      }}
    >
      {children}
      <p className="sr-only" aria-live="polite">{pending ? searchingLabel : ""}</p>
      {pending && <span className="absolute inset-x-4 bottom-0 h-0.5 animate-pulse rounded bg-brand-600" aria-hidden />}
    </form>
  );
}
