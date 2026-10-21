import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { CATEGORIES, getCategory } from "@/lib/catalog";
import { CONDITION_GRADES, GRADE_INFO } from "@/lib/constants";
import { getBrands, searchListings } from "@/lib/data/catalog";
import { browseSchema, type BrowseParams } from "@/lib/validation";
import { pluralize } from "@/lib/format";
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
  const [results, brands] = await Promise.all([searchListings(params), getBrands(params.category)]);
  const basePath = fixedCategory ? `/c/${fixedCategory}` : "/listings";

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
      <Filters params={params} brands={brands} basePath={basePath} fixedCategory={fixedCategory} />
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600" aria-live="polite">
            {pluralize(results.total, "listing")}
            {params.q ? (
              <>
                {" "}for <strong className="text-ink">&ldquo;{params.q}&rdquo;</strong>
              </>
            ) : null}
          </p>
          <SortForm params={params} basePath={basePath} />
        </div>
        {results.items.length ? (
          <ListingGrid listings={results.items} priorityCount={4} />
        ) : (
          <EmptyState
            title="No listings match your filters"
            description="Try widening your price range or removing a filter."
            action={
              <Link href={basePath} className="text-sm font-semibold text-brand-700 hover:underline">
                Clear all filters
              </Link>
            }
          />
        )}
        <Pagination params={params} pages={results.pages} basePath={basePath} />
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
}: {
  params: BrowseParams;
  brands: { brand: string; count: number }[];
  basePath: string;
  fixedCategory?: string;
}) {
  // Plain GET form: works without JavaScript and produces shareable, crawlable URLs.
  return (
    <aside aria-label="Filters">
      <details open className="card group p-4 lg:sticky lg:top-32">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold lg:pointer-events-none">
          <SlidersHorizontal className="size-4" aria-hidden /> Filters
        </summary>
        <form method="get" action={basePath} className="mt-4 space-y-5 text-sm">
          {params.q && <input type="hidden" name="q" value={params.q} />}
          {params.sort !== "newest" && <input type="hidden" name="sort" value={params.sort} />}

          {!fixedCategory && (
            <div>
              <label htmlFor="f-category" className="label">
                Category
              </label>
              <select id="f-category" name="category" defaultValue={params.category ?? ""} className="input">
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <fieldset>
            <legend className="label">Condition</legend>
            <div className="space-y-1.5">
              {CONDITION_GRADES.map((g) => (
                <label key={g} className="flex items-center gap-2">
                  <input type="checkbox" name="grade" value={g} defaultChecked={params.grade.includes(g)} className="size-4 accent-brand-600" />
                  {GRADE_INFO[g].label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">Price</legend>
            <div className="flex items-center gap-2">
              <input name="min" inputMode="numeric" placeholder="Min (Rp)" defaultValue={params.min ?? ""} className="input" aria-label="Minimum price" />
              <span className="text-slate-400">–</span>
              <input name="max" inputMode="numeric" placeholder="Max (Rp)" defaultValue={params.max ?? ""} className="input" aria-label="Maximum price" />
            </div>
          </fieldset>

          {brands.length > 0 && (
            <div>
              <label htmlFor="f-brand" className="label">
                Brand
              </label>
              <select id="f-brand" name="brand" defaultValue={params.brand ?? ""} className="input">
                <option value="">Any brand</option>
                {brands.map((b) => (
                  <option key={b.brand} value={b.brand}>
                    {b.brand} ({b.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          <fieldset className="space-y-1.5">
            <legend className="label">Trust</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="verified" value="1" defaultChecked={params.verified} className="size-4 accent-brand-600" />
              Verified sellers only
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="warranty" value="1" defaultChecked={params.warranty} className="size-4 accent-brand-600" />
              With warranty
            </label>
          </fieldset>

          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-brand-700">
              Apply
            </button>
            <Link href={basePath} className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">
              Reset
            </Link>
          </div>
        </form>
      </details>
    </aside>
  );
}

function SortForm({ params, basePath }: { params: BrowseParams; basePath: string }) {
  const options = [
    ["newest", "Newest"],
    ["price_asc", "Price: low to high"],
    ["price_desc", "Price: high to low"],
    ["best_condition", "Best condition"],
  ] as const;
  return (
    <nav aria-label="Sort" className="flex flex-wrap gap-1 text-sm">
      {options.map(([value, label]) => (
        <Link
          key={value}
          href={`${basePath}${toQuery(params, { sort: value, page: 1 }, basePath !== "/listings")}`}
          className={`rounded-full px-3 py-1 ${params.sort === value ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-200"}`}
          aria-current={params.sort === value ? "true" : undefined}
          scroll={false}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Pagination({ params, pages, basePath }: { params: BrowseParams; pages: number; basePath: string }) {
  if (pages <= 1) return null;
  const omit = basePath !== "/listings";
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2 text-sm">
      {params.page > 1 && (
        <Link rel="prev" href={`${basePath}${toQuery(params, { page: params.page - 1 }, omit)}`} className="rounded-lg px-3 py-2 ring-1 ring-slate-300 hover:bg-white">
          Previous
        </Link>
      )}
      <span className="px-3 text-slate-600">
        Page {params.page} of {pages}
      </span>
      {params.page < pages && (
        <Link rel="next" href={`${basePath}${toQuery(params, { page: params.page + 1 }, omit)}`} className="rounded-lg px-3 py-2 ring-1 ring-slate-300 hover:bg-white">
          Next
        </Link>
      )}
    </nav>
  );
}

export function categoryHeading(slug?: string) {
  return slug ? (getCategory(slug)?.name ?? "Listings") : "All listings";
}
