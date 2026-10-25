import { Suspense } from "react";
import { Search } from "lucide-react";
import { Link } from "@/i18n/client";
import { localePath, pick, type Locale } from "@/i18n/locales";
import { dictionaryFor } from "@/i18n/server";
import { CATEGORIES } from "@/lib/catalog";
import type { CheckStatus } from "@/lib/constants";
import { ConditionStrip } from "@/components/condition-strip";
import { RequestedPath } from "@/components/requested-path";
import { ButtonLink } from "@/components/ui";

// The missing page gets the same treatment as any item on ReGear: a short
// condition report saying what failed and what still works.

const RESULT_TONE: Record<CheckStatus, string> = { FAIL: "text-fail", MINOR: "text-minor", PASS: "text-pass", NA: "text-slate-500" };
const DOT: Record<CheckStatus, string> = { FAIL: "bg-fail", MINOR: "bg-minor", PASS: "bg-pass", NA: "bg-na" };
const ROWS = [
  { key: "address", status: "FAIL" },
  { key: "listing", status: "MINOR" },
  { key: "site", status: "PASS" },
] as const;

/** The 404 body in one language. Element ids carry the language, since the global 404 renders both. */
export function NotFoundContent({ locale }: { locale: Locale }) {
  const dict = dictionaryFor(locale);
  const t = dict.notFound;
  const id = (name: string) => `notfound-${name}-${locale}`;

  return (
    <div className="container-page grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_26rem] lg:gap-16 lg:py-20">
      <div className="max-w-xl">
        <h1 className="text-4xl font-extrabold sm:text-5xl">{t.heading}</h1>
        <p className="mt-4 text-lg text-slate-600">{t.body}</p>

        <form action={localePath("/listings", locale)} method="get" role="search" className="mt-8 flex gap-2">
          <label htmlFor={id("search")} className="sr-only">
            {t.searchLabel}
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id={id("search")} name="q" type="search" maxLength={100} placeholder={dict.nav.searchPlaceholder} className="input h-11 pl-9" />
          </div>
          <button type="submit" className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
            {t.searchButton}
          </button>
        </form>

        <nav aria-labelledby={id("categories")} className="mt-8">
          <h2 id={id("categories")} className="text-sm font-semibold">
            {t.categories}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className="text-slate-600 underline-offset-4 hover:text-brand-700 hover:underline">
                  {pick(c.name, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ButtonLink href="/listings" variant="secondary" className="mt-8">
          {t.browseAll}
        </ButtonLink>
      </div>

      <section aria-labelledby={id("report")} className="card overflow-hidden">
        <div className="border-b border-rule p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id={id("report")} className="font-bold">
              {t.reportTitle}
            </h2>
            <span className="num shrink-0 text-xs font-semibold text-fail">{t.code}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t.requested}</p>
          <p className="num mt-0.5 min-h-5 text-sm font-medium break-all text-ink">
            <Suspense fallback={null}>
              <RequestedPath />
            </Suspense>
          </p>
          <ConditionStrip checks={ROWS.map((r) => ({ status: r.status }))} label={t.stripLabel} size="lg" animate className="mt-4" />
        </div>
        <ul className="divide-y divide-rule">
          {ROWS.map(({ key, status }) => {
            const row = t.rows[key];
            return (
              <li key={key} className="grid grid-cols-[auto_1fr] gap-x-3 p-5">
                <span className={`mt-1.5 size-2.5 rounded-full ${DOT[status]}`} aria-hidden />
                <div>
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-semibold">{row.check}</span>
                    <span className={`font-semibold ${RESULT_TONE[status]}`}>{row.result}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{row.note}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
