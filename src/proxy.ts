import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, LANG_COOKIE, LANG_HEADER, localePath, splitLocale, type Locale } from "@/i18n/locales";
import { en } from "@/i18n/dictionaries/en";
import { id } from "@/i18n/dictionaries/id";
import { clientIpFromForwarded } from "@/lib/security/ip";
import { createWindowLimiter } from "@/lib/security/window-limit";

// 1. Language. Indonesian lives at clean URLs and is rewritten to the internal
//    "/id/..." route; English lives under "/en". "/id/..." itself redirects to
//    the clean URL (that's also how the switcher returns to Indonesian). A
//    remembered English choice sends clean URLs to "/en/...".
// 2. Optimistic, cookie-presence-only gate for private areas so anonymous users
//    are redirected before any rendering work happens. This is NOT the security
//    boundary: every page, Server Action and route handler re-validates the
//    session against the database through the Data Access Layer.
// 3. Storefront searches are limited per visitor, so scripts can't make the
//    database run unlimited uncached queries. Counted in memory: a database
//    write per search would cost more than the search it guards.
const SESSION_COOKIES = ["__Host-regear_session", "regear_session"];
const PRIVATE_PATHS = ["/account", "/sell", "/admin", "/checkout", "/disputes"];

const isPrivate = (path: string) => PRIVATE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

// A busy shopper sends 15–25 a minute (live search sends one request per pause
// in typing; paging and filters with a search active count too). Mobile
// networks put many people behind one address, so this leaves room for several
// of them; 2 a second from one address is still nothing for the database.
// The log line below shows whether real (signed-in) customers ever reach it.
const SEARCHES_PER_MINUTE = 120;
const searchLimit = createWindowLimiter({ limit: SEARCHES_PER_MINUTE, windowMs: 60_000 });

/** A storefront search the visitor asked for (not a link prefetch, not plain browsing). */
function isSearch(request: NextRequest, path: string) {
  if ((request.method !== "GET" && request.method !== "HEAD") || !request.nextUrl.searchParams.get("q")?.trim()) return false;
  // Only a static segment prefetch skips the search: Next.js treats a request
  // as one only with both of these headers. Anyone can send these headers, so
  // any other combination (a runtime prefetch, or a plain page request carrying
  // one of them) still runs the search and is counted.
  if (request.headers.get("rsc") === "1" && request.headers.get("next-router-prefetch") === "1") return false;
  return path === "/listings" || path.startsWith("/c/");
}

// Same rule as getClientIp(), which can't run here: forwarded addresses only count behind our own proxy.
function clientIp(request: NextRequest) {
  if (process.env.TRUST_PROXY !== "true") return "local";
  const hops = Math.min(5, Math.max(1, Number(process.env.TRUST_PROXY_HOPS) || 1));
  return clientIpFromForwarded(request.headers.get("x-forwarded-for"), hops) ?? request.headers.get("x-real-ip")?.trim() ?? "local";
}

function tooManySearches(locale: Locale, retryAfterSec: number) {
  const t = (locale === "en" ? en : id).errors;
  // A bare page: it's served before (and instead of) the app. Every string in it is ours.
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.tooManySearches} | ReGear</title></head><body style="margin:15vh auto;max-width:32rem;padding:0 16px;font-family:system-ui,sans-serif;color:#1a2233;text-align:center"><h1 style="font-size:1.5rem">${t.tooManySearches}</h1><p>${t.tooManySearchesBody(retryAfterSec)}</p><p><a href="${localePath("/listings", locale)}" style="color:#2340d9">${t.backToListings}</a></p></body></html>`;
  return new NextResponse(html, {
    status: 429,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": String(retryAfterSec), "Cache-Control": "no-store" },
  });
}

function rememberLocale(response: NextResponse, request: NextRequest, locale: Locale) {
  if (request.cookies.get(LANG_COOKIE)?.value !== locale) {
    response.cookies.set(LANG_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const prefix = pathname.split("/")[1];

  if (prefix === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    return rememberLocale(NextResponse.redirect(url), request, DEFAULT_LOCALE);
  }

  const explicit = isLocale(prefix) ? prefix : null;
  const remembered = request.cookies.get(LANG_COOKIE)?.value;
  if (!explicit && request.method === "GET" && isLocale(remembered) && remembered !== DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = localePath(pathname, remembered);
    return NextResponse.redirect(url);
  }

  const locale = explicit ?? DEFAULT_LOCALE;
  const { path } = splitLocale(pathname);
  if (isSearch(request, path)) {
    const ip = clientIp(request);
    const limited = searchLimit(ip);
    if (limited.justExceeded) {
      // Once per address per minute. The address is kept only in the server log.
      const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
      console.warn(`[search-limit] ${ip} went over ${SEARCHES_PER_MINUTE} searches a minute (${signedIn ? "signed in" : "anonymous"})`);
    }
    if (!limited.ok) return tooManySearches(locale, limited.retryAfterSec);
  }
  if (isPrivate(path) && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const url = request.nextUrl.clone();
    url.pathname = localePath("/login", locale);
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LANG_HEADER, locale);
  const response = explicit
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.rewrite(new URL(`/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}${search}`, request.url), {
        request: { headers: requestHeaders },
      });
  return rememberLocale(response, request, locale);
}

export const config = {
  // Every page; not API routes, media, Next internals or files with an extension.
  matcher: ["/((?!api/|media/|_next/|.*\\..*).*)"],
};
