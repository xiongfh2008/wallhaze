import type { MetadataRoute } from "next";
import { absoluteLocaleUrl, languageAlternates } from "@/lib/seo";
import { PRESET_WALLPAPERS } from "@/lib/wallpapers";
import { getCommunityWorks } from "@/lib/community";

/**
 * Metadata Route for /sitemap.xml.
 *
 * Every public page × all seven languages (English unprefixed, Simplified
 * Chinese under /zh, Japanese under /ja, Korean under /ko, Spanish under
 * /es, French under /fr, German under /de), each with its hreflang
 * alternates — including cleared static wallpaper detail pages. Pending
 * artwork pages are reachable but excluded and marked noindex.
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
    { path: "/community", priority: 0.8, changeFrequency: "weekly" },
    // FE09 content pages. Deliberately EXCLUDED: account-private pages
    // (/login /signup /account /credits /my-creations — noindex) and the
    // unreleased legal drafts (/privacy /terms — noindex until effective).
    { path: "/about", priority: 0.5, changeFrequency: "monthly" },
    { path: "/faq", priority: 0.5, changeFrequency: "monthly" },
    { path: "/help", priority: 0.5, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.4, changeFrequency: "monthly" },
    // Only cleared artwork is indexable. Pending detail pages stay reachable
    // for transparency but are noindex and deliberately excluded here.
    ...PRESET_WALLPAPERS.filter(
      (wallpaper) => wallpaper.canPubliclyDisplay
    ).map((wallpaper) => ({
      path: `/wallpapers/${wallpaper.id}`,
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),
    // Community work pages only include explicitly published + displayable
    // records; platform samples and human-reviewed submissions share this
    // route but remain separately labelled in the UI.
    ...getCommunityWorks().map((work) => ({
      path: `/community/${work.slug}`,
      priority: 0.5,
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
