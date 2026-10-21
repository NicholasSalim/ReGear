import type { Metadata } from "next";
import { DEFAULT_LOCALE, LOCALES, localePath, type Locale } from "./locales";

/** Canonical URL plus hreflang alternates for a page that exists in every language. */
export function alternatesFor(path: string, locale: Locale): NonNullable<Metadata["alternates"]> & { canonical: string } {
  return {
    canonical: localePath(path, locale),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, localePath(path, l)])),
      "x-default": localePath(path, DEFAULT_LOCALE),
    },
  };
}
