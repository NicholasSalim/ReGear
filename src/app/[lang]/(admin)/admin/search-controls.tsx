import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { ADMIN_PAGE_SIZE, searchQuery, type AdminSearch } from "@/lib/admin/search";
import { buttonClass } from "@/components/ui";

// Plain GET forms and links: searching works without JavaScript, and every
// result page has its own URL.

export async function SearchBar({
  search,
  path,
  placeholder,
  statuses,
  statusLabel,
}: {
  search: AdminSearch;
  /** The page the form submits to, so "Clear" can drop every parameter. */
  path: string;
  placeholder: string;
  statuses?: { value: string; label: string }[];
  /** Name of the status filter, when it isn't a status (e.g. "Action" on the audit log). */
  statusLabel?: string;
}) {
  const t = (await getDictionary()).admin.searchBar;
  const active = !!(search.q || search.status || search.from || search.to);
  return (
    <form method="get" role="search" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
      <label className="min-w-0 flex-1 basis-60 text-xs font-medium text-slate-500">
        {t.label}
        <input name="q" type="search" defaultValue={search.q} placeholder={placeholder} maxLength={100} className="input mt-1" />
      </label>
      {statuses && (
        <label className="text-xs font-medium text-slate-500">
          {statusLabel ?? t.status}
          <select name="status" defaultValue={search.status ?? ""} className="input mt-1 w-auto">
            <option value="">{t.all}</option>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-xs font-medium text-slate-500">
        {t.from}
        <input name="from" type="date" defaultValue={search.from} className="input mt-1 w-auto" />
      </label>
      <label className="text-xs font-medium text-slate-500">
        {t.to}
        <input name="to" type="date" defaultValue={search.to} className="input mt-1 w-auto" />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={buttonClass("primary")}>{t.submit}</button>
        {active && (
          <Link href={path} className={buttonClass("ghost")}>
            {t.clear}
          </Link>
        )}
      </div>
    </form>
  );
}

/** "N results" with previous/next links that keep the search. */
export async function Pager({ search, total, path }: { search: AdminSearch; total: number; path: string }) {
  const t = (await getDictionary()).admin.searchBar;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600" aria-label={t.pages}>
      <p>
        {t.results(total)}
        {pages > 1 && ` · ${t.page(search.page, pages)}`}
      </p>
      {pages > 1 && (
        <div className="flex gap-2">
          {search.page > 1 && (
            <Link href={`${path}${searchQuery(search, search.page - 1)}`} className={buttonClass("secondary", "px-3 py-1.5")}>
              {t.prev}
            </Link>
          )}
          {search.page < pages && (
            <Link href={`${path}${searchQuery(search, search.page + 1)}`} className={buttonClass("secondary", "px-3 py-1.5")}>
              {t.next}
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
