import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Client IP. Forwarded headers are trusted only behind a known proxy.
 * Each proxy appends the address it received the request from, so only the
 * rightmost TRUST_PROXY_HOPS entries were written by our own proxies; anything
 * further left came from the client and could be invented to dodge rate limits.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  if (env.TRUST_PROXY) {
    return clientIpFromForwarded(h.get("x-forwarded-for"), env.TRUST_PROXY_HOPS) ?? h.get("x-real-ip")?.trim() ?? "local";
  }
  return "local";
}

/** The address our outermost trusted proxy saw, from an X-Forwarded-For value. */
export function clientIpFromForwarded(header: string | null | undefined, hops: number): string | null {
  const entries = (header ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return entries.length ? entries[Math.max(0, entries.length - hops)] : null;
}

export async function getUserAgent(): Promise<string | undefined> {
  return (await headers()).get("user-agent") ?? undefined;
}

/**
 * CSRF defence for Route Handlers (Server Actions already enforce this in Next.js).
 * Requires the Origin header of state-changing requests to match our host.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = (env.TRUST_PROXY ? req.headers.get("x-forwarded-host") : null) ?? req.headers.get("host");
    return o.host === host || o.origin === new URL(env.NEXT_PUBLIC_SITE_URL).origin;
  } catch {
    return false;
  }
}

/**
 * Allow only same-site relative redirect targets (prevents open redirects).
 * Browsers drop tabs and newlines from URLs and read "\" as "/", so "/\t/evil"
 * would become "//evil", another site. Such characters are refused, and the
 * target must still be on our origin once resolved.
 */
export function safeRedirectPath(target: unknown, fallback = "/"): string {
  if (typeof target !== "string" || !target.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(target)) return fallback;
  try {
    const base = new URL(env.NEXT_PUBLIC_SITE_URL);
    const url = new URL(target, base);
    if (url.origin !== base.origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
