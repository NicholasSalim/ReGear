import type { MetadataRoute } from "next";
import { LOCALES, localePath } from "@/i18n/locales";
import { CATEGORIES } from "@/lib/catalog";
import { getSitemapEntries } from "@/lib/data/catalog";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type Entry = Omit<MetadataRoute.Sitemap[number], "url" | "alternates"> & { path: string };

// Every page in every language, each listing its language alternates.
function inAllLanguages({ path, ...rest }: Entry): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${base}${localePath(path, l)}`]));
  return LOCALES.map((l) => ({ url: `${base}${localePath(path, l)}`, alternates: { languages }, ...rest }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { listings, sellers } = await getSitemapEntries();
  const entries: Entry[] = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/listings", changeFrequency: "hourly", priority: 0.9 },
    { path: "/how-it-works", changeFrequency: "monthly", priority: 0.4 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
    ...CATEGORIES.map((c) => ({ path: `/c/${c.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...listings.map((l) => ({ path: `/listings/${l.slug}`, lastModified: l.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...sellers.map((s) => ({ path: `/sellers/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
  return entries.flatMap(inAllLanguages);
}
