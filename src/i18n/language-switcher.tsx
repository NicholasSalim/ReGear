"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useT } from "./client";
import { LOCALES, splitLocale } from "./locales";

// Links to the current page in each language. Indonesian goes through "/id/...",
// which the proxy redirects to the clean URL and remembers. Plain <a> on purpose:
// a different language is a different root layout, so it's a full page load.
export function LanguageSwitcher({ className }: { className?: string }) {
  const current = useLocale();
  const t = useT();
  const { path } = splitLocale(usePathname());
  const query = useSearchParams().toString();

  return (
    <nav aria-label={t.language.label} className={className}>
      <ul className="flex items-center gap-1 text-xs font-semibold">
        {LOCALES.map((locale, i) => (
          <li key={locale} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-300" aria-hidden>|</span>}
            <a
              href={`/${locale}${path === "/" ? "" : path}${query ? `?${query}` : ""}`}
              hrefLang={locale}
              lang={locale}
              aria-current={locale === current ? "true" : undefined}
              aria-label={t.language.switchTo[locale]}
              className={`rounded px-1.5 py-1 uppercase ${locale === current ? "text-ink" : "text-slate-500 hover:text-brand-700"}`}
            >
              {locale}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
