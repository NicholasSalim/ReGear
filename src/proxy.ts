import { NextResponse, type NextRequest } from "next/server";

// Optimistic, cookie-presence-only gate for private areas so anonymous users
// are redirected before any rendering work happens. This is NOT the security
// boundary: every page, Server Action and route handler re-validates the
// session against the database through the Data Access Layer.
const SESSION_COOKIES = ["__Host-regear_session", "regear_session"];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/sell/:path*", "/admin/:path*", "/checkout/:path*", "/disputes/:path*"],
};
