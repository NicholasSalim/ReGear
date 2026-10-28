import "server-only";
import { escapeLike } from "@/lib/search-text";

// Search and paging for the admin history pages. Everything arrives as GET
// parameters (q, status, from, to, page), so a search is a link an admin can
// bookmark or send to a colleague.

export const ADMIN_PAGE_SIZE = 25;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type AdminSearch<S extends string = string> = {
  q: string;
  status: S | undefined;
  from: string;
  to: string;
  page: number;
  skip: number;
  take: number;
};

/** Read the search from the URL, ignoring anything malformed. `statuses` are the values the status filter accepts. */
export function readSearch<S extends string>(params: Params, statuses: readonly S[] = []): AdminSearch<S> {
  const status = one(params.status);
  const from = one(params.from) ?? "";
  const to = one(params.to) ?? "";
  const page = Math.min(1000, Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1));
  return {
    q: (one(params.q) ?? "").trim().slice(0, 100),
    status: statuses.find((s) => s === status),
    from: DAY.test(from) ? from : "",
    to: DAY.test(to) ? to : "",
    page,
    skip: (page - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
  };
}

/** A filter on whole days, as an Indonesian admin means them (Jakarta time). */
export function dayRange(s: { from: string; to: string }) {
  if (!s.from && !s.to) return undefined;
  return {
    ...(s.from ? { gte: new Date(`${s.from}T00:00:00+07:00`) } : {}),
    ...(s.to ? { lte: new Date(`${s.to}T23:59:59.999+07:00`) } : {}),
  };
}

/** Case-insensitive "contains" for a text column, matching the text literally. */
export const like = (q: string) => ({ contains: escapeLike(q), mode: "insensitive" as const });

/** The search as URL parameters, for links that keep it (paging, "see all"). */
export function searchQuery(s: Pick<AdminSearch, "q" | "status" | "from" | "to">, page?: number) {
  const params = new URLSearchParams();
  if (s.q) params.set("q", s.q);
  if (s.status) params.set("status", s.status);
  if (s.from) params.set("from", s.from);
  if (s.to) params.set("to", s.to);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
