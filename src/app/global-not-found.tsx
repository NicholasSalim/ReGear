import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { LocaleProvider } from "@/i18n/client";
import { LOCALES, localePath } from "@/i18n/locales";
import { dictionaryFor } from "@/i18n/server";
import { LogoMark } from "@/components/condition-strip";
import { NotFoundContent } from "@/components/not-found-content";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Shown for addresses that match no route. It renders outside app/[lang] and
// is served as static HTML, so it holds both languages; the script below
// picks one from the address (/en/... is English) before the page paints.
// Without JavaScript the Indonesian version shows.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });

export const metadata: Metadata = { title: "404 · ReGear", robots: { index: false } };

const PICK_LANGUAGE = `(function(){var p=location.pathname;if(p==="/en"||p.indexOf("/en/")===0){var d=document.documentElement;d.lang="en";d.dataset.lang="en";}})();`;

export default function GlobalNotFound() {
  return (
    <html lang="id" className={`${archivo.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PICK_LANGUAGE }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {LOCALES.map((locale) => {
          const t = dictionaryFor(locale);
          return (
            <div key={locale} data-locale-block={locale} lang={locale} className="flex flex-1 flex-col">
              <LocaleProvider locale={locale}>
                <header className="container-page flex h-16 items-center justify-between">
                  <a href={localePath("/", locale)} className="flex items-center gap-2.5 text-ink" aria-label={t.nav.homeAria}>
                    <LogoMark />
                    <span className="wide text-[1.35rem] leading-none font-extrabold tracking-[-0.03em]">ReGear</span>
                  </a>
                  <a href={localePath("/", locale)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink">
                    <ArrowLeft className="size-4" aria-hidden />
                    {t.nav.backToHome}
                  </a>
                </header>
                <main className="flex flex-1 flex-col">
                  <NotFoundContent locale={locale} />
                </main>
              </LocaleProvider>
            </div>
          );
        })}
      </body>
    </html>
  );
}
