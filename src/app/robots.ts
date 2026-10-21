import type { MetadataRoute } from "next";
import { LOCALES, localePath } from "@/i18n/locales";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const PRIVATE = ["/account", "/sell", "/admin", "/checkout", "/disputes", "/compare", "/login", "/register"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...LOCALES.flatMap((l) => PRIVATE.map((p) => localePath(p, l))), "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
