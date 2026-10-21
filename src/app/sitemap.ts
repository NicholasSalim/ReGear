import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/catalog";
import { getSitemapEntries } from "@/lib/data/catalog";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { listings, sellers } = await getSitemapEntries();
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/listings`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/how-it-works`, changeFrequency: "monthly", priority: 0.4 },
    ...CATEGORIES.map((c) => ({ url: `${base}/c/${c.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...listings.map((l) => ({ url: `${base}/listings/${l.slug}`, lastModified: l.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...sellers.map((s) => ({ url: `${base}/sellers/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
