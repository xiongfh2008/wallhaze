import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * i18n + routing integrity for the FE05–FE09 pages.
 *
 * - All seven message files must keep EXACTLY the same key set — a missing
 *   translation would render raw keys for real users.
 * - Every nav/footer destination must exist as a real page — no dead links.
 * - Account-private pages must carry noindex in their metadata; public
 *   content pages (including the effective legal pages) must not.
 * - The sitemap must include public content pages, legal pages, cleared
 *   wallpaper details and published community works, and must exclude
 *   noindex pages.
 */

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = path.join(webRoot, "messages");
const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"] as const;

function keySet(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) =>
    keySet(v, prefix ? `${prefix}.${key}` : key)
  );
}

function readMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(messagesDir, `${locale}.json`), "utf8"));
}

/** Route registry — single source of truth for this test. */
const PUBLIC_CONTENT_ROUTES = [
  "/about",
  "/faq",
  "/help",
  "/contact",
  "/community",
  // Effective legal pages: public, indexable, no sign-in required.
  "/privacy",
  "/terms",
] as const;
const PRIVATE_ROUTES = [
  "/login",
  "/signup",
  "/account",
  "/account/settings",
  "/account/orders",
  "/credits",
  "/my-creations",
] as const;
const NOINDEX_ROUTES: readonly string[] = [...PRIVATE_ROUTES];

function pageFile(route: string): string {
  return path.join(webRoot, "app", "[locale]", ...route.split("/"), "page.tsx");
}

describe("i18n parity (7 locales)", () => {
  it("all seven message files share the exact same key set", () => {
    const base = keySet(readMessages("en")).sort();
    expect(base.length).toBeGreaterThan(500); // real content, not empty shells

    for (const locale of LOCALES.slice(1)) {
      const keys = keySet(readMessages(locale)).sort();
      expect(keys, `locale ${locale}`).toEqual(base);
    }
  });

  it("new FE05–FE09 namespaces exist with real copy in every locale", () => {
    for (const locale of LOCALES) {
      const messages = readMessages(locale);
      for (const ns of ["auth", "account", "wallet", "creations", "about", "faq", "help", "contact", "privacy", "terms"]) {
        expect(messages[ns], `${locale}.${ns}`).toBeTypeOf("object");
      }
    }
  });
});

describe("route registry (no dead links)", () => {
  it("every FE05–FE09 route exists as a page file", () => {
    for (const route of [...PUBLIC_CONTENT_ROUTES, ...PRIVATE_ROUTES]) {
      expect(existsSync(pageFile(route)), `missing page for ${route}`).toBe(true);
    }
  });

  it("noindex: private pages declare it, public pages (incl. legal) do not", () => {
    for (const route of NOINDEX_ROUTES) {
      const source = readFileSync(pageFile(route), "utf8");
      expect(source, `${route} must be noindex`).toContain("noindex: true");
    }
    for (const route of PUBLIC_CONTENT_ROUTES) {
      const source = readFileSync(pageFile(route), "utf8");
      expect(source, `${route} must stay indexable`).not.toContain("noindex");
    }
  });
});

describe("sitemap", () => {
  it("includes public content pages, legal pages + 18 cleared wallpapers; excludes noindex pages", async () => {
    const { default: buildSitemap } = await import("../app/sitemap");
    const siteUrl = "https://wallhaze.com";
    const paths = buildSitemap().map((entry) =>
      entry.url.startsWith(siteUrl) ? entry.url.slice(siteUrl.length) : entry.url
    );

    for (const route of PUBLIC_CONTENT_ROUTES) {
      expect(paths).toContain(route);
    }
    const wallpapers = paths.filter((p) => p.startsWith("/wallpapers/"));
    expect(wallpapers).toHaveLength(18);
    const communityWorks = paths.filter((p) => p.startsWith("/community/"));
    // Sitemap lists real submissions only — never demo seed pages.
    expect(communityWorks).toHaveLength(0);

    for (const route of NOINDEX_ROUTES) {
      expect(paths, `${route} must not be in the sitemap`).not.toContain(route);
    }
  });
});
