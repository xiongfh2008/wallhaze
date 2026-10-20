import type { MetadataRoute } from "next";
import { absoluteLocaleUrl, languageAlternates } from "@/lib/seo";
import { PRESET_WALLPAPERS } from "@/lib/wallpapers";

/**
 * Metadata Route for /sitemap.xml.
 *
 * Every public page × all seven languages (English unprefixed, Simplified
 * Chinese under /zh, Japanese under /ja, Korean under /ko, Spanish under
 * /es, French under /fr, German under /de), each with its hreflang
 * alternates — including the 39 static wallpaper detail pages.
 *
 * No lastModified on purpose:
 * Cache Components forbids dynamic values during prerender, and a hardcoded
 * date would go stale.
 *
 * changeFrequency/priority are hints for crawlers — they do not
 * guarantee any search ranking.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/wallpapers", priority: 0.9, changeFrequency: "weekly" },
    { path: "/studio", priority: 0.8, changeFrequency: "weekly" },
    // Static preset artwork — content only changes through a data audit.
    ...PRESET_WALLPAPERS.map((wallpaper) => ({
      path: `/wallpapers/${wallpaper.id}`,
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),
  ];

  return entries.map(({ path, priority, changeFrequency }) => ({
    url: absoluteLocaleUrl("en", path),
    changeFrequency,
    priority,
    alternates: {
      languages: languageAlternates(path),
    },
  }));
}
