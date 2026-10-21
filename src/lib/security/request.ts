import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/** Client IP. Forwarded headers are trusted only behind a known proxy. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  if (env.TRUST_PROXY) {
    const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
    const real = h.get("x-real-ip");
    if (real) return real;
  }
  return "local";
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
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === host || o.origin === new URL(env.NEXT_PUBLIC_SITE_URL).origin;
  } catch {
    return false;
  }
}

/** Allow only same-site relative redirect targets (prevents open redirects). */
export function safeRedirectPath(target: unknown, fallback = "/"): string {
  if (typeof target !== "string") return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  return target;
}
