import type { Metadata } from "next";
import { Bell, BellOff } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireTrader } from "@/lib/auth/dal";
import { formatDate } from "@/lib/format";
import { describeSearch, getSavedSearches, savedSearchHref } from "@/lib/saved-searches";
import { deleteSavedSearchAction, setAlertsAction } from "@/actions/buying";
import { ActionButton } from "@/components/forms";
import { EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).searches.metaTitle };
}

export default async function SavedSearchesPage() {
  const user = await requireTrader("/account/searches");
  const [searches, dict, locale] = await Promise.all([getSavedSearches(user.id), getDictionary(), getLocale()]);
  const t = dict.searches;

  return (
    <>
      <PageHeader title={t.title} description={t.intro} />
      {searches.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyHint} />
      ) : (
        <ul className="card divide-y divide-rule">
          {searches.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-44 flex-1 text-sm">
                {/* Named in the viewer's language from the filters; the stored label is only for emails. */}
                <p className="font-semibold text-ink">{describeSearch(s.parsed, dict, locale)}</p>
                <p className="text-xs text-slate-500">
                  {t.savedOn(formatDate(s.createdAt, locale))} ·{" "}
                  <span className={s.alerts ? "text-pass" : ""}>{s.alerts ? t.alertsOn : t.alertsOff}</span>
                </p>
                {s.fresh > 0 && <p className="mt-0.5 text-xs font-semibold text-brand-700">{t.fresh(s.fresh)}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={savedSearchHref(s)}
                  className="press inline-flex items-center rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-action-hover"
                >
                  {t.run}
                </Link>
                <ActionButton action={setAlertsAction.bind(null, s.id, !s.alerts)} variant="secondary" className="rounded-full! px-3 py-1.5">
                  {s.alerts ? <BellOff className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
                  {s.alerts ? t.turnOff : t.turnOn}
                </ActionButton>
                <ActionButton action={deleteSavedSearchAction.bind(null, s.id)} variant="ghost" className="px-3 py-1.5 text-rose-700">
                  {t.remove}
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
