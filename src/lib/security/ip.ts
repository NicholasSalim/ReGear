// Kept free of server-only imports so proxy.ts can use it too.

/** The address our outermost trusted proxy saw, from an X-Forwarded-For value. */
export function clientIpFromForwarded(header: string | null | undefined, hops: number): string | null {
  const entries = (header ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return entries.length ? entries[Math.max(0, entries.length - hops)] : null;
}
