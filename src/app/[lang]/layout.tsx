import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { LocaleProvider } from "@/i18n/client";
import { alternatesFor } from "@/i18n/metadata";
import { LOCALES } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { THEME_SCRIPT } from "@/lib/theme";
import "../globals.css";

// Variable Archivo with the width axis: expanded for labels/headlines, normal for reading.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Every page exists in each language; the proxy maps clean URLs to "id".
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return {
    metadataBase: new URL(siteUrl),
    title: { default: t.meta.siteTitle, template: "%s | ReGear" },
    description: t.meta.siteDescription,
    applicationName: "ReGear",
    keywords: t.meta.keywords,
    openGraph: { type: "website", siteName: "ReGear", locale: t.meta.ogLocale, url: alternatesFor("/", locale).canonical },
    twitter: { card: "summary_large_image" },
    alternates: alternatesFor("/", locale),
    robots: { index: true, follow: true },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#2340d9",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return (
    // The inline script sets data-theme on <html> before React hydrates.
    <html lang={locale} className={`${archivo.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          {t.common.skipToContent}
        </a>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
