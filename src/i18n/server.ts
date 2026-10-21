import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { lang } from "next/root-params";
import { en } from "./dictionaries/en";
import { id } from "./dictionaries/id";
import { DEFAULT_LOCALE, isLocale, LANG_COOKIE, LANG_HEADER, localePath, type Locale } from "./locales";

const DICTIONARIES = { id, en } as const;
export type Dictionary = typeof en;

/** The page's language, from the [lang] URL segment. Server Components only. */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!isLocale(value)) notFound();
  return value;
}

/** The dictionary for the page's language. Server Components only. */
export async function getDictionary(): Promise<Dictionary> {
  return DICTIONARIES[await getLocale()];
}

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/**
 * The language of the current request where root params are unavailable
 * (Server Actions, Route Handlers, shared server helpers). The proxy sets the
 * header on every page request; the cookie covers anything else.
 */
export async function getRequestLocale(): Promise<Locale> {
  const fromHeader = (await headers()).get(LANG_HEADER);
  if (isLocale(fromHeader)) return fromHeader;
  const fromCookie = (await cookies()).get(LANG_COOKIE)?.value;
  return isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
}

/** `redirect()` that keeps the visitor's language. */
export async function localeRedirect(path: string): Promise<never> {
  redirect(localePath(path, await getRequestLocale()));
}
