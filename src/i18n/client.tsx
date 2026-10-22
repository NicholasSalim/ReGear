"use client";

import NextLink from "next/link";
import { createContext, useContext, type ComponentProps } from "react";
import { clientEn } from "./dictionaries/client.en";
import { clientId } from "./dictionaries/client.id";
import { DEFAULT_LOCALE, localePath, type Locale } from "./locales";

// Client Components get a small dictionary of their own: dictionary entries
// with parameters are functions, which can't be passed from server to client.
const CLIENT_DICTIONARIES = { id: clientId, en: clientEn } as const;
export type ClientDictionary = typeof clientEn;

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): ClientDictionary {
  return CLIENT_DICTIONARIES[useLocale()];
}

/** next/link that keeps the current language for internal paths. */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  return <NextLink href={typeof href === "string" ? localePath(href, locale) : href} {...props} />;
}

/** "Loading…" in the visitor's language, for placeholders that Server Components render. */
export function LoadingLabel() {
  return <>{useT().forms.loading}</>;
}
