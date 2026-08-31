import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

// Match layout.tsx getSiteUrl(): `??` lets an empty-string env through and
// produces host-less URLs; `|| trim()` falls back, and the domain must be the
// real one (prsloy.online), not prsloy.com.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.prsloy.online"
).replace(/\/+$/, "");

const STATIC_PAGES = ["", "pricing", "faq", "setup", "blog", "privacy", "terms", "refunds"];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    for (const page of STATIC_PAGES) {
      const path = page ? `/${locale}/${page}` : `/${locale}`;
      const alternates: Record<string, string> = {};
      for (const altLocale of routing.locales) {
        const altPath = page ? `/${altLocale}/${page}` : `/${altLocale}`;
        alternates[altLocale] = `${SITE_URL}${altPath}`;
      }
      entries.push({
        url: `${SITE_URL}${path}`,
        lastModified: new Date(),
        changeFrequency: page === "blog" ? "weekly" : "monthly",
        priority: page === "" ? 1.0 : 0.7,
        alternates: { languages: alternates },
      });
    }
  }

  return entries;
}
