import { Suspense } from "react";
import { Check, ChevronDown, Heart, LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import { Link } from "@/i18n/client";
import { localePath, pick, type Locale } from "@/i18n/locales";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { CATEGORIES, categoryName } from "@/lib/catalog";
import { CONDITION_GRADES, GRADE_INFO } from "@/lib/constants";
import { getBrandFacets, getCategoryFacets, searchListings } from "@/lib/data/catalog";
import { formatMoney } from "@/lib/format";
import { browseSchema, SORTS, type BrowseParams } from "@/lib/validation";
import { AccountMenu } from "@/components/account-menu";
import { ListingGrid, ListingList } from "@/components/listing-card";
import { EmptyState } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { getCurrentUser } from "@/lib/auth/dal";
import { isSaved, savedQuery } from "@/lib/saved-searches";
import { saveSearchAction } from "@/actions/buying";

type RawParams = Record<string, string | string[] | undefined>;

export function parseBrowseParams(raw: RawParams, fixedCategory?: string): BrowseParams {
  return browseSchema.parse({ ...raw, ...(fixedCategory ? { category: fixedCategory } : {}) });
}

/** Builds the address of this results page with some parameters changed. Any change goes back to page 1. */
type Href = (overrides?: Partial<Record<keyof BrowseParams, unknown>>) => string;

/** Results + filters for /listings and /c/[category]. Must render inside <Suspense>. */
export async function BrowseView({
  searchParams,
  fixedCategory,
}: {
  searchParams: Promise<RawParams>;
  fixedCategory?: string;
}) {
  const params = parseBrowseParams(await searchParams, fixedCategory);
  const [results, brands, facets, locale, t] = await Promise.all([
    // The view only changes how results are laid out, so it stays out of the cached query.
    searchListings({ ...params, view: "list" }),
    getBrandFacets({ ...params, view: "list", page: 1, sort: "newest" }),
    getCategoryFacets({ ...params, view: "list", page: 1, sort: "newest" }),
    getLocale(),
    getDictionary(),
  ]);
  const basePath = fixedCategory ? `/c/${fixedCategory}` : "/listings";
  const href: Href = (overrides = {}) => `${basePath}${toQuery(params, { page: 1, ...overrides }, !!fixedCategory)}`;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Filters params={params} brands={brands} facets={facets} basePath={basePath} href={href} fixedCategory={fixedCategory} locale={locale} t={t} />
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-base text-ink" aria-live="polite">
            <strong className="num font-bold">{t.browse.resultCount(results.total)}</strong>
            {params.q ? (
              <>
                {" "}
                {t.browse.forQuery} <strong>&ldquo;{params.q}&rdquo;</strong>
              </>
            ) : null}
          </p>
          <Suspense fallback={null}>
            <SaveSearch params={params} here={`${basePath}${toQuery(params, {}, !!fixedCategory)}`} />
          </Suspense>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-rule pb-3">
          <QuickFilters params={params} href={href} t={t} />
          <div className="ml-auto flex items-center gap-1">
            <SortMenu params={params} href={href} t={t} />
            <ViewToggle params={params} href={href} t={t} />
          </div>
        </div>

        <AppliedFilters params={params} href={href} basePath={basePath} fixedCategory={fixedCategory} locale={locale} t={t} />

        <div className="mt-5">
          {results.items.length === 0 ? (
            <EmptyState
              title={t.browse.noResults}
              description={t.browse.noResultsHint}
              action={
                <Link href={basePath} className="text-sm font-semibold text-brand-700 hover:underline">
                  {t.browse.clearFilters}
                </Link>
              }
            />
          ) : params.view === "grid" ? (
            <ListingGrid listings={results.items} priorityCount={4} />
          ) : (
            <ListingList listings={results.items} priorityCount={3} />
          )}
        </div>
        <Pagination params={params} pages={results.pages} href={href} t={t} />
      </div>
    </div>
  );
}

function toQuery(params: BrowseParams, overrides: Partial<Record<keyof BrowseParams, unknown>> = {}, omitCategory = false) {
  const merged = { ...params, ...overrides } as Record<string, unknown>;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (omitCategory && k === "category") continue;
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (k === "page" && v === 1) continue;
    if (k === "sort" && v === "newest") continue;
    if (k === "view" && v === "list") continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)));
    else qs.set(k, v === true ? "1" : String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** "Save this search": saves the filters on screen, or says they're already saved. */
async function SaveSearch({ params, here }: { params: BrowseParams; here: string }) {
  const [user, t, locale] = await Promise.all([getCurrentUser(), getDictionary(), getLocale()]);
  const link = "inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline";
  if (!user) {
    return (
      <Link href={`/login?next=${encodeURIComponent(localePath(here, locale))}`} className={link}>
        <Heart className="size-4" aria-hidden /> {t.searches.signInToSave}
      </Link>
    );
  }
  if (await isSaved(user.id, params)) {
    return (
      <Link href="/account/searches" className={link}>
        <Heart className="size-4 fill-brand-600" aria-hidden /> {t.searches.saved}
      </Link>
    );
  }
  return (
    <ActionButton action={saveSearchAction.bind(null, savedQuery(params))} variant="ghost" className="-my-1 px-2 py-1 text-brand-700">
      <Heart className="size-4" aria-hidden /> {t.searches.save}
    </ActionButton>
  );
}

/** One filter value in the sidebar: a link that adds or removes it, drawn like a checkbox. */
function FacetLink({ href, active, count, children }: { href: string; active: boolean; count?: number; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} scroll={false} aria-current={active ? "true" : undefined} className="group flex items-center gap-2.5 py-1 text-slate-700 hover:text-ink">
        <span
          aria-hidden
          className={`grid size-4 shrink-0 place-items-center rounded border ${active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-400 bg-surface group-hover:border-slate-600"}`}
        >
          {active && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className={active ? "font-semibold text-ink" : ""}>{children}</span>
        {count !== undefined && <span className="num text-xs text-slate-500">({count})</span>}
      </Link>
    </li>
  );
}

function FacetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule pt-4 first:border-t-0 first:pt-0">
      <h2 className="mb-2 text-[15px] font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Filters({
  params,
  brands,
  facets,
  basePath,
  href,
  fixedCategory,
  locale,
  t,
}: {
  params: BrowseParams;
  brands: { brand: string; count: number }[];
  facets: Record<string, number>;
  basePath: string;
  href: Href;
  fixedCategory?: string;
  locale: Locale;
  t: Dictionary;
}) {
  const activeFilters =
    params.grade.length +
    [!fixedCategory && params.category, params.min, params.max, params.brand, params.verified, params.warranty].filter(Boolean).length;
  // Moving between categories keeps the search and the filters that apply everywhere.
  const crossCategory = { ...params, category: undefined, brand: undefined, page: 1 };
  const shownBrands = brands.slice(0, 8);
  const moreBrands = brands.slice(8);
  const brandLink = (b: { brand: string; count: number }) => (
    <FacetLink key={b.brand} href={href({ brand: params.brand === b.brand ? undefined : b.brand })} active={params.brand === b.brand} count={b.count}>
      {b.brand}
    </FacetLink>
  );
  // The price form keeps every other filter as hidden fields.
  const keep = [...new URLSearchParams(toQuery(params, { min: undefined, max: undefined, page: 1 }, !!fixedCategory)).entries()];

  // Below the sidebar layout the filters start closed so listings come first; the
  // checkbox opens them with CSS alone, and the sidebar always shows them.
  return (
    <aside aria-label={t.browse.filtersAria} className="text-sm">
      <div className="max-lg:rounded-[var(--radius-panel)] max-lg:border max-lg:border-rule max-lg:bg-surface max-lg:p-4">
        <input id="f-open" type="checkbox" className="peer sr-only lg:hidden" />
        <label
          htmlFor="f-open"
          className="flex cursor-pointer items-center gap-2 rounded font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700 peer-checked:[&_.chevron]:rotate-180 lg:hidden"
        >
          <SlidersHorizontal className="size-4" aria-hidden /> {t.browse.filters}
          {activeFilters > 0 && <span className="num rounded-full bg-brand-50 px-2 text-xs text-brand-800">{activeFilters}</span>}
          <ChevronDown className="chevron ml-auto size-4 transition-transform" aria-hidden />
        </label>
        <div className="reveal-narrow mt-4 hidden space-y-4 peer-checked:block lg:mt-0 lg:block">
          <FacetSection title={t.browse.category}>
            <ul>
              <li>
                <Link
                  href={`/listings${toQuery(crossCategory)}`}
                  className={`block py-1 ${params.category ? "text-brand-700 hover:underline" : "font-semibold text-ink"}`}
                >
                  {t.browse.allCategories}
                </Link>
              </li>
              {CATEGORIES.filter((c) => facets[c.slug] || c.slug === params.category).map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/c/${c.slug}${toQuery(crossCategory, {}, true)}`}
                    aria-current={c.slug === params.category ? "page" : undefined}
                    className={`block py-1 pl-3 ${c.slug === params.category ? "font-semibold text-ink" : "text-brand-700 hover:underline"}`}
                  >
                    {pick(c.name, locale)} <span className="num text-xs text-slate-500">({facets[c.slug] ?? 0})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </FacetSection>

          <FacetSection title={t.browse.condition}>
            <ul>
              {CONDITION_GRADES.map((g) => {
                const on = params.grade.includes(g);
                return (
                  <FacetLink key={g} href={href({ grade: on ? params.grade.filter((x) => x !== g) : [...params.grade, g] })} active={on}>
                    {pick(GRADE_INFO[g].label, locale)}
                  </FacetLink>
                );
              })}
            </ul>
          </FacetSection>

          <FacetSection title={t.browse.price}>
            <form method="get" action={localePath(basePath, locale)} className="flex items-center gap-1.5">
              {keep.map(([k, v], i) => (
                <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
              ))}
              <input name="min" inputMode="numeric" placeholder={t.browse.minPrice} defaultValue={params.min ?? ""} className="input min-w-0 px-2 text-xs" aria-label={t.browse.minPriceAria} />
              <span className="text-slate-400">–</span>
              <input name="max" inputMode="numeric" placeholder={t.browse.maxPrice} defaultValue={params.max ?? ""} className="input min-w-0 px-2 text-xs" aria-label={t.browse.maxPriceAria} />
              <button type="submit" className="press shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-ink ring-1 ring-slate-400 hover:bg-slate-100">
                {t.browse.go}
              </button>
            </form>
          </FacetSection>

          {brands.length > 0 && (
            <FacetSection title={t.browse.brand}>
              <ul>{shownBrands.map(brandLink)}</ul>
              {moreBrands.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer list-none py-1 text-brand-700 hover:underline group-open:hidden [&::-webkit-details-marker]:hidden">
                    {t.browse.showMore}
                  </summary>
                  <ul>{moreBrands.map(brandLink)}</ul>
                </details>
              )}
            </FacetSection>
          )}

          <FacetSection title={t.browse.trust}>
            <ul>
              <FacetLink href={href({ verified: !params.verified })} active={params.verified}>
                {t.browse.verifiedOnly}
              </FacetLink>
              <FacetLink href={href({ warranty: !params.warranty })} active={params.warranty}>
                {t.browse.withWarranty}
              </FacetLink>
            </ul>
          </FacetSection>
        </div>
      </div>
    </aside>
  );
}

/** The pills above the results: everything, or only the two trust filters buyers reach for most. */
function QuickFilters({ params, href, t }: { params: BrowseParams; href: Href; t: Dictionary }) {
  const pill = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm ${active ? "bg-inverse font-semibold text-white" : "text-slate-700 ring-1 ring-rule hover:bg-slate-100"}`;
  const all = !params.verified && !params.warranty;
  return (
    <nav aria-label={t.browse.filtersAria} className="flex flex-wrap gap-2">
      <Link href={href({ verified: false, warranty: false })} scroll={false} aria-current={all ? "true" : undefined} className={pill(all)}>
        {t.browse.all}
      </Link>
      <Link href={href({ verified: !params.verified })} scroll={false} aria-current={params.verified ? "true" : undefined} className={pill(params.verified)}>
        {t.browse.verifiedOnly}
      </Link>
      <Link href={href({ warranty: !params.warranty })} scroll={false} aria-current={params.warranty ? "true" : undefined} className={pill(params.warranty)}>
        {t.browse.withWarranty}
      </Link>
    </nav>
  );
}

function SortMenu({ params, href, t }: { params: BrowseParams; href: Href; t: Dictionary }) {
  return (
    <AccountMenu
      summaryClassName="gap-1 rounded-full px-3.5 py-1.5 text-sm text-slate-700 ring-1 ring-rule hover:bg-slate-100"
      panelClassName="right-0 w-52 origin-top-right"
      summary={
        <>
          {t.browse.sortBy(t.browse.sort[params.sort])}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </>
      }
    >
      <nav aria-label={t.browse.sortAria}>
        {SORTS.map((value) => (
          <Link
            key={value}
            href={href({ sort: value })}
            scroll={false}
            aria-current={params.sort === value ? "true" : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-100 ${params.sort === value ? "font-semibold text-ink" : "text-slate-700"}`}
          >
            {t.browse.sort[value]}
            {params.sort === value && <Check className="size-4" aria-hidden />}
          </Link>
        ))}
      </nav>
    </AccountMenu>
  );
}

function ViewToggle({ params, href, t }: { params: BrowseParams; href: Href; t: Dictionary }) {
  const item = (view: "list" | "grid", label: string, Icon: typeof List) => (
    <Link
      href={href({ view, page: params.page })}
      scroll={false}
      aria-label={label}
      title={label}
      aria-current={params.view === view ? "true" : undefined}
      className={`grid size-9 place-items-center rounded-full ${params.view === view ? "bg-plate text-ink" : "text-slate-500 hover:bg-slate-100 hover:text-ink"}`}
    >
      <Icon className="size-4" aria-hidden />
    </Link>
  );
  return (
    <nav aria-label={t.browse.viewAria} className="flex items-center max-sm:hidden">
      {item("list", t.browse.listView, List)}
      {item("grid", t.browse.galleryView, LayoutGrid)}
    </nav>
  );
}

/** Every filter in use as a chip that removes it. */
function AppliedFilters({
  params,
  href,
  basePath,
  fixedCategory,
  locale,
  t,
}: {
  params: BrowseParams;
  href: Href;
  basePath: string;
  fixedCategory?: string;
  locale: Locale;
  t: Dictionary;
}) {
  const chips: { label: string; href: string }[] = [];
  if (params.category && !fixedCategory) chips.push({ label: categoryName(params.category, locale), href: href({ category: undefined }) });
  for (const g of params.grade) chips.push({ label: pick(GRADE_INFO[g].label, locale), href: href({ grade: params.grade.filter((x) => x !== g) }) });
  if (params.brand) chips.push({ label: params.brand, href: href({ brand: undefined }) });
  if (params.min !== undefined || params.max !== undefined) {
    const label =
      params.min !== undefined && params.max !== undefined
        ? t.browse.priceRange(formatMoney(params.min), formatMoney(params.max))
        : params.min !== undefined
          ? t.browse.priceFrom(formatMoney(params.min))
          : t.browse.priceUpTo(formatMoney(params.max!));
    chips.push({ label, href: href({ min: undefined, max: undefined }) });
  }
  if (params.verified) chips.push({ label: t.browse.verifiedOnly, href: href({ verified: false }) });
  if (params.warranty) chips.push({ label: t.browse.withWarranty, href: href({ warranty: false }) });
  if (!chips.length) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-label={t.browse.applied} role="group">
      {chips.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          scroll={false}
          aria-label={t.browse.removeFilter(c.label)}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pr-2 pl-3 text-brand-800 hover:bg-brand-100"
        >
          {c.label} <X className="size-3.5" aria-hidden />
        </Link>
      ))}
      <Link href={`${basePath}${toQuery({ ...params, grade: [], brand: undefined, min: undefined, max: undefined, verified: false, warranty: false, category: fixedCategory as BrowseParams["category"], page: 1 }, {}, !!fixedCategory)}`} scroll={false} className="px-1 font-semibold text-brand-700 hover:underline">
        {t.browse.clearAll}
      </Link>
    </div>
  );
}

/** Numbered pages around the current one, with the first and last always reachable. */
function Pagination({ params, pages, href, t }: { params: BrowseParams; pages: number; href: Href; t: Dictionary }) {
  if (pages <= 1) return null;
  const current = params.page;
  const shown = [...new Set([1, current - 1, current, current + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const cell = "grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm";
  return (
    <nav aria-label={t.browse.paginationAria} className="mt-10 flex flex-wrap items-center justify-center gap-1">
      {current > 1 && (
        <Link rel="prev" href={href({ page: current - 1 })} className={`${cell} text-slate-700 hover:bg-slate-100`}>
          ‹ <span className="sr-only">{t.browse.previous}</span>
        </Link>
      )}
      {shown.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - shown[i - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
          <Link
            href={href({ page: p })}
            aria-label={t.browse.page(p)}
            aria-current={p === current ? "page" : undefined}
            className={`${cell} num ${p === current ? "bg-inverse font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            {p}
          </Link>
        </span>
      ))}
      {current < pages && (
        <Link rel="next" href={href({ page: current + 1 })} className={`${cell} text-slate-700 hover:bg-slate-100`}>
          <span className="sr-only">{t.browse.next}</span> ›
        </Link>
      )}
    </nav>
  );
}
