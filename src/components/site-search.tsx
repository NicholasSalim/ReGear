"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { localePath, splitLocale } from "@/i18n/locales";
import { useLiveSearch } from "@/components/live-search";

type Props = {
  label: string;
  placeholder: string;
  submit: string;
  categoryLabel: string;
  allCategories: string;
  categories: { slug: string; name: string }[];
};

// Pages whose results the header search refines in place.
const isResultsPage = (path: string) => path === "/listings" || path.startsWith("/c/");

/**
 * The header search, with a category picker beside the box. On a results page
 * it searches as you type, keeping the other filters; elsewhere it's a plain
 * form that opens the results.
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
  const locale = useLocale();
  const { path } = splitLocale(pathname);
  const live = isResultsPage(path);
  const { pending, go, goLater } = useLiveSearch();
  const pageCategory = path.startsWith("/c/") ? path.slice(3) : (params.get("category") ?? "");

  // Staying in the page's own category keeps the address; another one moves to /listings with it as a filter.
  function target(q: string, category: string) {
    const next = new URLSearchParams(params);
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    next.delete("page");
    let base = pathname;
    if (path.startsWith("/c/") ? category !== pageCategory : true) {
      base = localePath("/listings", locale);
      if (category) next.set("category", category);
      else next.delete("category");
    }
    const query = next.toString();
    return `${base}${query ? `?${query}` : ""}`;
  }

  if (!live) return <SearchForm {...props} defaultCategory={pageCategory} />;
  return (
    <SearchForm
      {...props}
      // A new search in the URL (Back, a link) refills the box.
      key={`${params.get("q") ?? ""}|${pageCategory}`}
      defaultValue={params.get("q") ?? ""}
      defaultCategory={pageCategory}
      pending={pending}
      onInput={(q, category) => goLater(target(q, category), q)}
      onSubmit={(q, category) => go(target(q, category))}
      onCategory={(q, category) => go(target(q, category))}
    />
  );
}

function SearchForm({
  label,
  placeholder,
  submit,
  categoryLabel,
  allCategories,
  categories,
  defaultValue,
  defaultCategory = "",
  pending,
  onInput,
  onSubmit,
  onCategory,
}: Props & {
  defaultValue?: string;
  defaultCategory?: string;
  pending?: boolean;
  onInput?: (q: string, category: string) => void;
  onSubmit?: (q: string, category: string) => void;
  onCategory?: (q: string, category: string) => void;
}) {
  const locale = useLocale();
  const values = (form: HTMLFormElement | null) => {
    const data = new FormData(form ?? undefined);
    return [String(data.get("q") ?? ""), String(data.get("category") ?? "")] as const;
  };
  return (
    <form
      action={localePath("/listings", locale)}
      method="get"
      role="search"
      aria-busy={pending}
      className="flex w-full min-w-0 items-center gap-2 md:gap-3"
      onSubmit={
        onSubmit &&
        ((e) => {
          e.preventDefault();
          onSubmit(...values(e.currentTarget));
        })
      }
    >
      <div className="relative flex h-11 min-w-0 flex-1 items-center rounded-full border-2 border-ink bg-surface focus-within:border-brand-600 focus-within:ring-3 focus-within:ring-brand-600/15 md:h-12">
        <Search className="pointer-events-none ml-4 size-5 shrink-0 text-slate-500" aria-hidden />
        <label htmlFor="site-search" className="sr-only">
          {label}
        </label>
        <input
          id="site-search"
          name="q"
          type="search"
          maxLength={100}
          defaultValue={defaultValue}
          placeholder={placeholder}
          onInput={onInput && ((e) => onInput(...values(e.currentTarget.form)))}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-ink placeholder:text-slate-400 focus:outline-none"
        />
        <div className="relative hidden h-7 shrink-0 border-l border-rule md:block">
          <label htmlFor="site-search-category" className="sr-only">
            {categoryLabel}
          </label>
          <select
            id="site-search-category"
            name="category"
            defaultValue={defaultCategory}
            onChange={onCategory && ((e) => onCategory(...values(e.currentTarget.form)))}
            className="h-full max-w-44 cursor-pointer appearance-none truncate bg-transparent pr-9 pl-3 text-sm text-slate-600 focus:outline-none"
          >
            <option value="">{allCategories}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
        </div>
        {pending && <span className="absolute inset-x-6 -bottom-1 h-0.5 animate-pulse rounded bg-brand-600" aria-hidden />}
      </div>
      <button
        type="submit"
        className="press grid h-11 shrink-0 place-items-center rounded-full bg-brand-600 px-4 font-semibold text-white hover:bg-action-hover md:h-12 md:px-10"
      >
        <Search className="size-5 md:hidden" aria-hidden />
        <span className="max-md:sr-only">{submit}</span>
      </button>
    </form>
  );
}
