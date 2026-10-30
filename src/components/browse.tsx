import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Link } from "@/i18n/client";
import { localePath, pick, type Locale } from "@/i18n/locales";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { CATEGORIES } from "@/lib/catalog";
import { CONDITION_GRADES, GRADE_INFO } from "@/lib/constants";
import { getBrands, searchListings } from "@/lib/data/catalog";
import { browseSchema, SORTS, type BrowseParams } from "@/lib/validation";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState } from "@/components/ui";

type RawParams = Record<string, string | string[] | undefined>;

export function parseBrowseParams(raw: RawParams, fixedCategory?: string): BrowseParams {
  return browseSchema.parse({ ...raw, ...(fixedCategory ? { category: fixedCategory } : {}) });
}

/** Results + filters for /listings and /c/[category]. Must render inside <Suspense>. */
export async function BrowseView({
  searchParams,
  fixedCategory,
}: {
  searchParams: Promise<RawParams>;
  fixedCategory?: string;
}) {
  const params = parseBrowseParams(await searchParams, fixedCategory);
  const [results, brands, locale, t] = await Promise.all([searchListings(params), getBrands(params.category), getLocale(), getDictionary()]);
  const basePath = fixedCategory ? `/c/${fixedCategory}` : "/listings";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
      <Filters params={params} brands={brands} basePath={basePath} fixedCategory={fixedCategory} locale={locale} t={t} />
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600" aria-live="polite">
            {t.browse.resultCount(results.total)}
            {params.q ? (
              <>
                {" "}
                {t.browse.forQuery} <strong className="text-ink">&ldquo;{params.q}&rdquo;</strong>
              </>
            ) : null}
          </p>
          <SortForm params={params} basePath={basePath} t={t} />
        </div>
        {results.items.length ? (
          <ListingGrid listings={results.items} priorityCount={4} />
        ) : (
          <EmptyState
            title={t.browse.noResults}
            description={t.browse.noResultsHint}
            action={
              <Link href={basePath} className="text-sm font-semibold text-brand-700 hover:underline">
                {t.browse.clearFilters}
              </Link>
            }
          />
        )}
        <Pagination params={params} pages={results.pages} basePath={basePath} t={t} />
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
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)));
    else qs.set(k, v === true ? "1" : String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function Filters({
  params,
  brands,
  basePath,
  fixedCategory,
  locale,
  t,
}: {
  params: BrowseParams;
  brands: { brand: string; count: number }[];
  basePath: string;
  fixedCategory?: string;
  locale: Locale;
  t: Dictionary;
}) {
  const activeFilters =
    params.grade.length +
    [!fixedCategory && params.category, params.min, params.max, params.brand, params.verified, params.warranty].filter(Boolean).length;

  // Plain GET form: works without JavaScript and produces shareable, crawlable URLs.
  // Below the sidebar layout the filters start closed so listings come first; the
  // checkbox opens them with CSS alone, and the sidebar always shows them.
  return (
    <aside aria-label={t.browse.filtersAria}>
      <div className="card p-4 lg:sticky lg:top-32">
        <input id="f-open" type="checkbox" className="peer sr-only lg:hidden" />
        <label
          htmlFor="f-open"
          className="flex cursor-pointer items-center gap-2 rounded font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700 peer-checked:[&_.chevron]:rotate-180 lg:pointer-events-none"
        >
          <SlidersHorizontal className="size-4" aria-hidden /> {t.browse.filters}
          {activeFilters > 0 && <span className="num rounded-full bg-brand-50 px-2 text-xs text-brand-800 lg:hidden">{activeFilters}</span>}
          <ChevronDown className="chevron ml-auto size-4 transition-transform lg:hidden" aria-hidden />
        </label>
        <form method="get" action={localePath(basePath, locale)} className="mt-4 hidden space-y-5 text-sm peer-checked:block lg:block">
          {params.q && <input type="hidden" name="q" value={params.q} />}
          {params.sort !== "newest" && <input type="hidden" name="sort" value={params.sort} />}

          {!fixedCategory && (
            <div>
              <label htmlFor="f-category" className="label">
                {t.browse.category}
              </label>
              <select id="f-category" name="category" defaultValue={params.category ?? ""} className="input">
                <option value="">{t.browse.allCategories}</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {pick(c.name, locale)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <fieldset>
            <legend className="label">{t.browse.condition}</legend>
            <div className="space-y-1.5">
              {CONDITION_GRADES.map((g) => (
                <label key={g} className="flex items-center gap-2">
                  <input type="checkbox" name="grade" value={g} defaultChecked={params.grade.includes(g)} className="size-4 accent-brand-600" />
                  {pick(GRADE_INFO[g].label, locale)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">{t.browse.price}</legend>
            <div className="flex items-center gap-2">
              <input name="min" inputMode="numeric" placeholder={t.browse.minPrice} defaultValue={params.min ?? ""} className="input" aria-label={t.browse.minPriceAria} />
              <span className="text-slate-400">–</span>
              <input name="max" inputMode="numeric" placeholder={t.browse.maxPrice} defaultValue={params.max ?? ""} className="input" aria-label={t.browse.maxPriceAria} />
            </div>
          </fieldset>

          {brands.length > 0 && (
            <div>
              <label htmlFor="f-brand" className="label">
                {t.browse.brand}
              </label>
              <select id="f-brand" name="brand" defaultValue={params.brand ?? ""} className="input">
                <option value="">{t.browse.anyBrand}</option>
                {brands.map((b) => (
                  <option key={b.brand} value={b.brand}>
                    {b.brand} ({b.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          <fieldset className="space-y-1.5">
            <legend className="label">{t.browse.trust}</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="verified" value="1" defaultChecked={params.verified} className="size-4 accent-brand-600" />
              {t.browse.verifiedOnly}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="warranty" value="1" defaultChecked={params.warranty} className="size-4 accent-brand-600" />
              {t.browse.withWarranty}
            </label>
          </fieldset>

          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-action-hover">
              {t.browse.apply}
            </button>
            <Link href={basePath} className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">
              {t.browse.reset}
            </Link>
          </div>
        </form>
      </div>
    </aside>
  );
}

function SortForm({ params, basePath, t }: { params: BrowseParams; basePath: string; t: Dictionary }) {
  return (
    <nav aria-label={t.browse.sortAria} className="flex flex-wrap gap-1 text-sm">
      {SORTS.map((value) => (
        <Link
          key={value}
          href={`${basePath}${toQuery(params, { sort: value, page: 1 }, basePath !== "/listings")}`}
          className={`rounded-full px-3 py-1 ${params.sort === value ? "bg-inverse text-white" : "text-slate-600 hover:bg-slate-200"}`}
          aria-current={params.sort === value ? "true" : undefined}
          scroll={false}
        >
          {t.browse.sort[value]}
        </Link>
      ))}
    </nav>
  );
}

function Pagination({ params, pages, basePath, t }: { params: BrowseParams; pages: number; basePath: string; t: Dictionary }) {
  if (pages <= 1) return null;
  const omit = basePath !== "/listings";
  return (
    <nav aria-label={t.browse.paginationAria} className="mt-8 flex items-center justify-center gap-2 text-sm">
      {params.page > 1 && (
        <Link rel="prev" href={`${basePath}${toQuery(params, { page: params.page - 1 }, omit)}`} className="rounded-lg px-3 py-2 ring-1 ring-slate-300 hover:bg-surface">
          {t.browse.previous}
        </Link>
      )}
      <span className="px-3 text-slate-600">{t.browse.pageOf(params.page, pages)}</span>
      {params.page < pages && (
        <Link rel="next" href={`${basePath}${toQuery(params, { page: params.page + 1 }, omit)}`} className="rounded-lg px-3 py-2 ring-1 ring-slate-300 hover:bg-surface">
          {t.browse.next}
        </Link>
      )}
    </nav>
  );
}
