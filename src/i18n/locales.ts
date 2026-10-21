// Supported languages and URL rules, shared by the proxy, server and client.
// Indonesian is the default and lives at clean URLs ("/listings"); English is
// served under "/en" ("/en/listings"). Internally every page is under
// app/[lang]/, and the proxy rewrites clean URLs to "/id/...".

export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "id";

/** Remembers the visitor's choice; also tells Server Actions which language to answer in. */
export const LANG_COOKIE = "regear_lang";
/** Set by the proxy on every page request so server code can read the language. */
export const LANG_HEADER = "x-regear-lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** "/listings" in the given language: unchanged for Indonesian, "/en/listings" for English. */
export function localePath(path: string, locale: Locale): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Splits a browser pathname into its language and the path without the prefix. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first, ...rest] = pathname.split("/");
  if (isLocale(first)) return { locale: first, path: `/${rest.join("/")}` };
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/** Text that exists in both languages, kept next to the data it describes (catalog, constants). */
export type Localized = Readonly<Record<Locale, string>>;

export function pick(text: Localized, locale: Locale): string {
  return text[locale];
}

/** Intl locale for dates and numbers. */
export const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-GB" };
