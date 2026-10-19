import type { MetadataRoute } from "next";

/**
 * Metadata Route for /robots.txt.
 * Fully permissive for public pages — the site is a public gallery and
 * generator; no private paths exist to disallow yet.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://wallhaze.com/sitemap.xml",
  };
}
