import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, LANG_COOKIE, LANG_HEADER, localePath, splitLocale, type Locale } from "@/i18n/locales";

// 1. Language. Indonesian lives at clean URLs and is rewritten to the internal
//    "/id/..." route; English lives under "/en". "/id/..." itself redirects to
//    the clean URL (that's also how the switcher returns to Indonesian). A
//    remembered English choice sends clean URLs to "/en/...".
// 2. Optimistic, cookie-presence-only gate for private areas so anonymous users
//    are redirected before any rendering work happens. This is NOT the security
//    boundary: every page, Server Action and route handler re-validates the
//    session against the database through the Data Access Layer.
const SESSION_COOKIES = ["__Host-regear_session", "regear_session"];
const PRIVATE_PATHS = ["/account", "/sell", "/admin", "/checkout", "/disputes"];

const isPrivate = (path: string) => PRIVATE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

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
  if (isPrivate(splitLocale(pathname).path) && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
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
