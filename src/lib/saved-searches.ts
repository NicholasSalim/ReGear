import "server-only";
import { isLocale, pick, type Locale } from "@/i18n/locales";
import type { Dictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { categoryName } from "@/lib/catalog";
import { GRADE_INFO } from "@/lib/constants";
import { browseWhere } from "@/lib/data/catalog";
import { enqueueEmail } from "@/lib/email/outbox";
import { formatMoney } from "@/lib/format";
import { DomainError } from "@/lib/orders/service";
import { browseSchema, type BrowseParams } from "@/lib/validation";

// Saved searches and their email alerts. A search is stored as its canonical
// query string, so the same filters saved twice are recognised, and it is
// re-parsed with the same schema the results page uses.

export const SAVED_SEARCH_LIMIT = 20;
/** At most one alert email per search in this time. */
const ALERT_EVERY_MS = 60 * 60_000;
const localeOf = (value: string) => (isLocale(value) ? value : "id");

/** The filters of a search as a stable query string: no page, sort or view, keys in a fixed order. */
export function canonicalQuery(p: BrowseParams) {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.category) qs.set("category", p.category);
  for (const g of [...p.grade].sort()) qs.append("grade", g);
  if (p.min !== undefined) qs.set("min", String(p.min));
  if (p.max !== undefined) qs.set("max", String(p.max));
  if (p.brand) qs.set("brand", p.brand);
  if (p.verified) qs.set("verified", "1");
  if (p.warranty) qs.set("warranty", "1");
  return qs.toString();
}

export function parseQuery(query: string): BrowseParams {
  const qs = new URLSearchParams(query);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(qs.keys())) {
    const all = qs.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return browseSchema.parse(raw);
}

/** A short name for a search, such as `"sony" · Audio · Excellent`. */
export function describeSearch(p: BrowseParams, t: Dictionary, locale: Locale) {
  const parts = [
    p.q ? `"${p.q}"` : null,
    p.category ? categoryName(p.category, locale) : null,
    p.brand,
    ...p.grade.map((g) => pick(GRADE_INFO[g].label, locale)),
    p.min !== undefined && p.max !== undefined
      ? t.browse.priceRange(formatMoney(p.min), formatMoney(p.max))
      : p.min !== undefined
        ? t.browse.priceFrom(formatMoney(p.min))
        : p.max !== undefined
          ? t.browse.priceUpTo(formatMoney(p.max))
          : null,
    p.verified ? t.browse.verifiedOnly : null,
    p.warranty ? t.browse.withWarranty : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : t.browse.allListings;
}

export async function saveSearch(userId: string, params: BrowseParams, label: string) {
  const query = canonicalQuery(params);
  const existing = await db.savedSearch.findUnique({ where: { userId_params: { userId, params: query } }, select: { id: true } });
  if (existing) return { id: existing.id };
  if ((await db.savedSearch.count({ where: { userId } })) >= SAVED_SEARCH_LIMIT) throw new DomainError("savedSearchLimit", SAVED_SEARCH_LIMIT);
  const saved = await db.savedSearch.create({ data: { userId, params: query, label: label.slice(0, 200) } });
  return { id: saved.id };
}

export async function deleteSavedSearch(userId: string, id: string) {
  const res = await db.savedSearch.deleteMany({ where: { id, userId } });
  if (res.count !== 1) throw new DomainError("savedSearchNotFound");
}

export async function setAlerts(userId: string, id: string, alerts: boolean) {
  // Turning alerts back on starts from now, so it doesn't email about everything listed while they were off.
  const res = await db.savedSearch.updateMany({ where: { id, userId }, data: alerts ? { alerts, lastAlertedAt: new Date() } : { alerts } });
  if (res.count !== 1) throw new DomainError("savedSearchNotFound");
}

export async function isSaved(userId: string, params: BrowseParams) {
  return !!(await db.savedSearch.findUnique({ where: { userId_params: { userId, params: canonicalQuery(params) } }, select: { id: true } }));
}

/** The user's saved searches with how many listings matched since the last alert. */
export async function getSavedSearches(userId: string) {
  const rows = await db.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return Promise.all(
    rows.map(async (s) => {
      const params = parseQuery(s.params);
      const fresh = await db.listing.count({ where: { ...browseWhere(params), publishedAt: { gt: s.lastAlertedAt } } });
      return { ...s, parsed: params, fresh };
    }),
  );
}

/** Maintenance: email users whose saved searches have new matches. Returns how many alerts were queued. */
export async function runSavedSearchAlerts(now = new Date()) {
  const due = await db.savedSearch.findMany({
    where: { alerts: true, lastAlertedAt: { lt: new Date(now.getTime() - ALERT_EVERY_MS) }, user: { deletedAt: null } },
    select: { id: true, userId: true, label: true, params: true, lastAlertedAt: true, user: { select: { locale: true } } },
    orderBy: { lastAlertedAt: "asc" },
    take: 500,
  });
  let queued = 0;
  for (const s of due) {
    const count = await db.listing.count({ where: { ...browseWhere(parseQuery(s.params)), publishedAt: { gt: s.lastAlertedAt, lte: now } } });
    await db.$transaction(async (tx) => {
      // The window moves on either way, so the same listings are never counted twice.
      const moved = await tx.savedSearch.updateMany({ where: { id: s.id, lastAlertedAt: s.lastAlertedAt }, data: { lastAlertedAt: now } });
      if (moved.count === 1 && count > 0) {
        await enqueueEmail(tx, { userId: s.userId, locale: localeOf(s.user.locale) }, { template: "saved-search-alert", params: { label: s.label, count, query: s.params } });
        queued++;
      }
    });
  }
  return queued;
}
