import type { MetadataRoute } from "next";

/**
 * Metadata Route for /sitemap.xml.
 * Only the pages that actually exist are listed — all seven languages
 * (English unprefixed, Simplified Chinese under /zh, Japanese under /ja,
 * Korean under /ko, Spanish under /es, French under /fr, German under /de).
 * No lastModified on purpose:
 * Cache Components forbids dynamic values during prerender, and a hardcoded
 * date would go stale.
 *
 * changeFrequency/priority are hints for crawlers — they do not
 * guarantee any search ranking.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://wallhaze.com/",
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          en: "https://wallhaze.com/",
          "x-default": "https://wallhaze.com/",
          zh: "https://wallhaze.com/zh",
          ja: "https://wallhaze.com/ja",
          ko: "https://wallhaze.com/ko",
          es: "https://wallhaze.com/es",
          fr: "https://wallhaze.com/fr",
          de: "https://wallhaze.com/de",
        },
      },
    },
    {
      url: "https://wallhaze.com/studio",
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: {
        languages: {
          en: "https://wallhaze.com/studio",
          "x-default": "https://wallhaze.com/studio",
          zh: "https://wallhaze.com/zh/studio",
          ja: "https://wallhaze.com/ja/studio",
          ko: "https://wallhaze.com/ko/studio",
          es: "https://wallhaze.com/es/studio",
          fr: "https://wallhaze.com/fr/studio",
          de: "https://wallhaze.com/de/studio",
        },
      },
    },
  ];
}
