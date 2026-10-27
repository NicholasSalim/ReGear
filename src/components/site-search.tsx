"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { localePath, splitLocale } from "@/i18n/locales";
import { useLiveSearch } from "@/components/live-search";

type Props = { label: string; placeholder: string };

// Pages whose results the header search refines in place.
const isResultsPage = (path: string) => path === "/listings" || path.startsWith("/c/");

/**
 * The header search. On a results page it searches as you type, keeping the
 * other filters; elsewhere it's a plain form that opens the results.
 */
export function SiteSearch(props: Props) {
  return (
    <Suspense fallback={<SearchForm {...props} />}>
      <LiveSiteSearch {...props} />
    </Suspense>
  );
}

function LiveSiteSearch(props: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const live = isResultsPage(splitLocale(pathname).path);
  const { pending, go, goLater } = useLiveSearch();

  function target(q: string) {
    const next = new URLSearchParams(params);
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    next.delete("page");
    const query = next.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }

  if (!live) return <SearchForm {...props} />;
  return (
    <SearchForm
      {...props}
      // A new search in the URL (Back, a link) refills the box.
      key={params.get("q") ?? ""}
      defaultValue={params.get("q") ?? ""}
      pending={pending}
      onInput={(q) => goLater(target(q), q)}
      onSubmit={(q) => go(target(q))}
    />
  );
}

function SearchForm({
  label,
  placeholder,
  defaultValue,
  pending,
  onInput,
  onSubmit,
}: Props & { defaultValue?: string; pending?: boolean; onInput?: (q: string) => void; onSubmit?: (q: string) => void }) {
  const locale = useLocale();
  return (
    <form
      action={localePath("/listings", locale)}
      method="get"
      role="search"
      aria-busy={pending}
      className="relative hidden flex-1 md:block md:max-w-xl"
      onSubmit={
        onSubmit &&
        ((e) => {
          e.preventDefault();
          onSubmit(String(new FormData(e.currentTarget).get("q") ?? ""));
        })
      }
    >
      <label htmlFor="site-search" className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        id="site-search"
        name="q"
        type="search"
        maxLength={100}
        defaultValue={defaultValue}
        placeholder={placeholder}
        onInput={onInput && ((e) => onInput(e.currentTarget.value))}
        className="input h-10 bg-paper pl-9"
      />
      {pending && <span className="absolute inset-x-2 -bottom-1 h-0.5 animate-pulse rounded bg-brand-600" aria-hidden />}
    </form>
  );
}
