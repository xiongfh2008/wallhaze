#!/usr/bin/env node
/**
 * SEO audit crawler for WallHaze.
 *
 * Fetches every indexable URL (from sitemap.xml loc + hreflang alternates)
 * from a running preview server, parses the rendered HTML and writes the
 * audit CSVs + a markdown summary under docs/seo-audit/.
 *
 * Usage:
 *   node scripts/seo-audit.mjs --base-url=http://127.0.0.1:3100 --label=before
 *   node scripts/seo-audit.mjs --base-url=http://127.0.0.1:3100 --label=after
 *
 * Exit code 1 when any P1 issue is found.
 *
 * Local-only tooling — never run against production, never deployed.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(WEB_ROOT, "docs", "seo-audit");

const PROD_ORIGIN = "https://wallhaze.com";
const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"];
const PREFIX = { en: "", zh: "/zh", ja: "/ja", ko: "/ko", es: "/es", fr: "/fr", de: "/de" };

// ---- CLI -----------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const BASE_URL = String(args["base-url"] ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const LABEL = String(args["label"] ?? "audit");
const CONCURRENCY = Number(args["concurrency"] ?? 8);
const FETCH_TIMEOUT_MS = Number(args["timeout"] ?? 120_000);

// ---- helpers -------------------------------------------------------------

/** Map any URL to "production space" so the link graph is stable. */
function toProdSpace(url) {
  try {
    const u = new URL(url, BASE_URL);
    u.hash = "";
    return PROD_ORIGIN + u.pathname + u.search;
  } catch {
    return null;
  }
}

function prodLocaleUrl(locale, prodPath) {
  const suffix = prodPath === "/" ? "" : prodPath;
  return `${PROD_ORIGIN}${PREFIX[locale]}${suffix}`;
}

function localeOfProdUrl(prodUrl) {
  const m = prodUrl.pathname.match(/^\/(zh|ja|ko|es|fr|de)(\/|$)/);
  return m ? m[1] : "en";
}

function prodPathOf(prodUrl) {
  const m = prodUrl.pathname.match(/^\/(zh|ja|ko|es|fr|de)(\/|$)/);
  return m ? prodUrl.pathname.slice(3) || "/" : prodUrl.pathname || "/";
}

const NON_PAGE_EXT = /\.(png|jpe?g|webp|avif|gif|svg|ico|css|js|mjs|json|xml|txt|webmanifest|mp4|webm|mov|zip|woff2?|ttf)$/i;
const NON_PAGE_PREFIX = /^\/(api|_next|assets|media|fonts|images|favicons)\//i;

function isPageLink(prodUrl) {
  return !NON_PAGE_EXT.test(prodUrl.pathname) && !NON_PAGE_PREFIX.test(prodUrl.pathname);
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

async function fetchText(url, timeout = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    const body = res.status === 200 ? await res.text() : "";
    return { status: res.status, body, finalUrl: res.url || url };
  } catch (err) {
    return { status: 0, body: "", finalUrl: url, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHeadStatus(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    await res.arrayBuffer().catch(() => {});
    return res.status;
  } catch {
    return 0;
  }
}

async function pool(items, worker, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

// ---- HTML parsing ----------------------------------------------------------

function parseHtml(html) {
  const doc = {
    title: "",
    description: "",
    robots: "",
    canonical: "",
    hreflang: {},
    ogLocale: "",
    h1: [],
    h2: [],
    jsonldTypes: [],
    links: [],
  };

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  doc.title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = tag.match(/\bname="([^"]*)"/i)?.[1]?.toLowerCase();
    const prop = tag.match(/\bproperty="([^"]*)"/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent="([^"]*)"/i)?.[1];
    if (content == null) continue;
    if (name === "description") doc.description = decodeEntities(content).trim();
    if (name === "robots") doc.robots = decodeEntities(content).trim();
    if (prop === "og:locale") doc.ogLocale = decodeEntities(content).trim();
  }

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tag.match(/\brel="([^"]*)"/i)?.[1]?.toLowerCase() ?? "";
    const href = tag.match(/\bhref="([^"]*)"/i)?.[1];
    const hreflang = tag.match(/\bhreflang="([^"]*)"/i)?.[1];
    if (rel === "canonical" && href) doc.canonical = decodeEntities(href).trim();
    if (rel === "alternate" && hreflang && href) doc.hreflang[hreflang] = decodeEntities(href).trim();
  }

  for (const m of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) doc.h1.push(stripTags(m[1]));
  for (const m of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) doc.h2.push(stripTags(m[1]));

  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const n of nodes) {
        const t = n?.["@type"];
        if (t) doc.jsonldTypes.push(...(Array.isArray(t) ? t : [t]));
      }
    } catch {
      doc.jsonldTypes.push("<<parse-error>>");
    }
  }

  for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const raw = m[1];
    const anchor = stripTags(m[2]);
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) continue;
    doc.links.push({ href: raw, anchor, prod: toProdSpace(raw) });
  }

  return doc;
}

// ---- main -------------------------------------------------------------------

console.log(`[seo-audit] base=${BASE_URL} label=${LABEL}`);

// 1. Sitemap
const sitemapRes = await fetchText(`${BASE_URL}/sitemap.xml`);
if (sitemapRes.status !== 200) {
  console.error(`[seo-audit] FATAL: sitemap.xml returned ${sitemapRes.status}`);
  process.exit(2);
}
const smHtml = sitemapRes.body;
const sitemapLocs = [...smHtml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => decodeEntities(m[1].trim()));
const sitemapAltCount = [...smHtml.matchAll(/<xhtml:link[^>]*rel="alternate"/g)].length;

// URL universe: every sitemap loc + every hreflang alternate in the sitemap
const urlSet = new Set();
for (const loc of sitemapLocs) {
  const prod = toProdSpace(loc.replace(PROD_ORIGIN, BASE_URL));
  if (prod) urlSet.add(prod);
}
for (const m of smHtml.matchAll(/<xhtml:link[^>]*href="([^"]*)"[^>]*>/g)) {
  const prod = toProdSpace(decodeEntities(m[1]).replace(PROD_ORIGIN, BASE_URL));
  if (prod) urlSet.add(prod);
}
const urls = [...urlSet].sort();
console.log(`[seo-audit] sitemap locs=${sitemapLocs.length} alternates=${sitemapAltCount} universe=${urls.length}`);

// 2. Fetch + parse every URL
const pages = await pool(urls, async (prodUrl) => {
  const local = prodUrl.replace(PROD_ORIGIN, BASE_URL);
  const { status, body, error } = await fetchText(local);
  const parsed = status === 200 ? parseHtml(body) : null;
  return { prodUrl, status, error, parsed };
});

const pageMap = new Map(pages.map((p) => [p.prodUrl, p]));

// 3. Collect outlink targets, find unknown same-origin page links
const unknownTargets = new Set();
for (const p of pages) {
  if (!p.parsed) continue;
  for (const l of p.parsed.links) {
    if (!l.prod) continue;
    let u;
    try {
      u = new URL(l.prod);
    } catch {
      continue;
    }
    if (u.origin !== PROD_ORIGIN || !isPageLink(u)) continue;
    if (!pageMap.has(l.prod)) unknownTargets.add(l.prod);
  }
}
const unknownStatus = await pool([...unknownTargets], (url) => fetchHeadStatus(url.replace(PROD_ORIGIN, BASE_URL)));
const unknownBroken = new Map(
  [...unknownTargets].map((url, i) => [url, unknownStatus[i]]).filter(([, s]) => s !== 200)
);
console.log(`[seo-audit] unknown link targets=${unknownTargets.size} broken=${unknownBroken.size}`);

// 4. Link graph + click depth
const inlinks = new Map(urls.map((u) => [u, 0]));
for (const p of pages) {
  if (!p.parsed) continue;
  const seen = new Set();
  for (const l of p.parsed.links) {
    if (!l.prod || seen.has(l.prod)) continue;
    seen.add(l.prod);
    if (inlinks.has(l.prod) && l.prod !== p.prodUrl) inlinks.set(l.prod, inlinks.get(l.prod) + 1);
  }
}
const depth = new Map(urls.map((u) => [u, Infinity]));
// Seed the English homepage. Both slash variants are covered because the
// sitemap loc for the root has no trailing slash while prod URLs normalize
// to one — a missed seed would silently disable the whole BFS.
for (const seed of [PROD_ORIGIN, `${PROD_ORIGIN}/`]) {
  if (urls.includes(seed)) depth.set(seed, 0);
}
let changed = true;
while (changed) {
  changed = false;
  for (const p of pages) {
    if (!p.parsed || !depth.has(p.prodUrl)) continue;
    const d = depth.get(p.prodUrl);
    if (d === Infinity) continue;
    for (const l of p.parsed.links) {
      if (!l.prod || !depth.has(l.prod)) continue;
      if (depth.get(l.prod) > d + 1) {
        depth.set(l.prod, d + 1);
        changed = true;
      }
    }
  }
}

// ---- checks -----------------------------------------------------------------

const issues = [];
let issueSeq = 0;
function addIssue(severity, pageUrl, locale, field, currentValue, problem, recommendedFix, sourceFile) {
  issues.push({
    id: `SEO-${String(++issueSeq).padStart(3, "0")}`,
    severity,
    url: pageUrl,
    locale,
    field,
    currentValue: currentValue.slice(0, 500),
    problem,
    recommendedFix,
    sourceFile: sourceFile ?? "",
  });
}

// expected indexable set = universe minus noindex pages
const seenTitlesByLocale = new Map(LOCALES.map((l) => [l, new Map()]));
const seenDescByLocale = new Map(LOCALES.map((l) => [l, new Map()]));

for (const p of pages) {
  const { prodUrl, status, parsed } = p;
  const locale = localeOfProdUrl(new URL(prodUrl));
  const prodPath = prodPathOf(new URL(prodUrl));
  const expectedCanonical = prodLocaleUrl(locale, prodPath);

  if (status !== 200) {
    addIssue("P1", prodUrl, locale, "status", String(status), "Indexable URL does not return 200", "Fix route or remove from sitemap", "");
    continue;
  }

  const title = parsed.title;
  const desc = parsed.description;

  if (!title) addIssue("P1", prodUrl, locale, "title", "", "Missing <title>", "Set a unique title", "");
  if (title) {
    const brandCount = (title.match(/WallHaze/g) ?? []).length;
    if (brandCount > 1) {
      addIssue("P1", prodUrl, locale, "title", title, "Brand name duplicated in title", "Keep exactly one 'WallHaze' — strip brand from the per-page title and let the layout template append it (or drop the template for this page)", "messages/*.json meta.*Title + app/[locale]/layout.tsx");
    }
    if (title.length < 15 || title.length > 65) {
      addIssue("P3", prodUrl, locale, "title", title, `Title length ${title.length} outside 15–65`, "Aim for 35–60 chars (EN) / reasonable CJK display width", "");
    }
    const seen = seenTitlesByLocale.get(locale);
    if (seen.has(title) && !title.includes("— Free Wallpaper") && !title.includes("License Review")) {
      addIssue("P2", prodUrl, locale, "title", title, `Duplicate title (also on ${seen.get(title)})`, "Make the title unique per page", "");
    } else if (!seen.has(title)) {
      seen.set(title, prodUrl);
    }
  }

  if (!desc) addIssue("P1", prodUrl, locale, "description", "", "Missing meta description", "Add a 110–160 char description", "");
  if (desc) {
    if (desc.length > 165) {
      addIssue("P2", prodUrl, locale, "description", desc, `Description too long (${desc.length} > 165 chars)`, "Tighten to 110–160 chars (EN); shorter for CJK. Do not mechanically truncate.", "messages/*.json meta.*Description");
    } else if (desc.length < 70 && locale === "en") {
      addIssue("P3", prodUrl, locale, "description", desc, `Description short (${desc.length} < 70 chars)`, "Expand to 110–160 chars with real facts", "");
    }
    const seen = seenDescByLocale.get(locale);
    if (seen.has(desc)) {
      addIssue("P2", prodUrl, locale, "description", desc, `Duplicate description (also on ${seen.get(desc)})`, "Differentiate per page", "");
    } else {
      seen.set(desc, prodUrl);
    }
    if (/available now|generate .* today|create .*now\b/i.test(desc) && /coming soon/i.test(desc) === false && prodPath === "/studio") {
      addIssue("P2", prodUrl, locale, "description", desc, "Studio description may overstate AI availability", "AI Studio is not live — description must say coming soon", "");
    }
  }

  if (parsed.h1.length !== 1) {
    addIssue("P2", prodUrl, locale, "h1", parsed.h1.join(" || ").slice(0, 200), `Expected exactly 1 H1, found ${parsed.h1.length}`, "Use a single descriptive H1", "");
  }

  if (parsed.canonical !== expectedCanonical) {
    addIssue("P1", prodUrl, locale, "canonical", parsed.canonical, `Canonical mismatch (expected ${expectedCanonical})`, "Fix canonical to the locale-prefixed URL", "lib/seo.ts pageMetadata / page generateMetadata");
  }

  const expectedAlternates = LOCALES.map((l) => [l, prodLocaleUrl(l, prodPath)]);
  for (const [l, expected] of expectedAlternates) {
    if (parsed.hreflang[l] !== expected) {
      addIssue("P2", prodUrl, locale, "hreflang", parsed.hreflang[l] ?? "(missing)", `hreflang ${l} mismatch (expected ${expected})`, "Fix alternates.languages", "lib/seo.ts languageAlternates");
    }
  }
  if (parsed.hreflang["x-default"] !== prodLocaleUrl("en", prodPath)) {
    addIssue("P2", prodUrl, locale, "hreflang", parsed.hreflang["x-default"] ?? "(missing)", "x-default mismatch", "Point x-default at the English URL", "lib/seo.ts languageAlternates");
  }

  if (/noindex/i.test(parsed.robots)) {
    addIssue("P1", prodUrl, locale, "robots", parsed.robots, "Page is in the sitemap universe but marked noindex", "Remove from sitemap or drop noindex", "");
  }

  const ogExpect = { en: "en_US", zh: "zh_CN", ja: "ja_JP", ko: "ko_KR", es: "es_ES", fr: "fr_FR", de: "de_DE" }[locale];
  if (parsed.ogLocale !== ogExpect) {
    addIssue("P3", prodUrl, locale, "og:locale", parsed.ogLocale, `Expected ${ogExpect}`, "Fix OG_LOCALE mapping", "lib/seo.ts");
  }
}

// orphans (indexable pages with zero inlinks)
const orphans = urls.filter((u) => {
  const p = pageMap.get(u);
  if (!p || p.status !== 200) return false;
  return inlinks.get(u) === 0 && u !== prodLocaleUrl("en", "/");
});

// broken internal links among known pages
const brokenKnown = pages.filter((p) => p.status !== 200).map((p) => [p.prodUrl, p.status]);

// ---- output -----------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const writeCsv = (name, header, rows) => {
  writeFileSync(path.join(OUT_DIR, name), "\uFEFF" + [header.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\r\n"), "utf8");
};

// metadata-{label}.csv
writeCsv(
  `metadata-${LABEL}.csv`,
  ["url", "locale", "path", "status", "title", "titleLen", "description", "descLen", "canonical", "hreflangCount", "ogLocale", "h1Count", "h1", "robots", "jsonldTypes"],
  pages.map((p) => {
    const u = new URL(p.prodUrl);
    return [
      p.prodUrl,
      localeOfProdUrl(u),
      prodPathOf(u),
      p.status,
      p.parsed?.title ?? "",
      p.parsed?.title?.length ?? 0,
      p.parsed?.description ?? "",
      p.parsed?.description?.length ?? 0,
      p.parsed?.canonical ?? "",
      Object.keys(p.parsed?.hreflang ?? {}).length,
      p.parsed?.ogLocale ?? "",
      p.parsed?.h1?.length ?? 0,
      (p.parsed?.h1 ?? []).join(" || "),
      p.parsed?.robots ?? "",
      (p.parsed?.jsonldTypes ?? []).join("|"),
    ];
  })
);

// content-{label}.csv — content-level issues
writeCsv(
  `content-${LABEL}.csv`,
  ["issueId", "severity", "url", "locale", "field", "currentValue", "problem", "recommendedFix", "sourceFile"],
  issues.map((i) => [i.id, i.severity, i.url, i.locale, i.field, i.currentValue, i.problem, i.recommendedFix, i.sourceFile])
);

// internal-links.csv
writeCsv(
  `internal-links-${LABEL}.csv`,
  ["url", "status", "inlinks", "outlinks", "clickDepth"],
  pages.map((p) => [
    p.prodUrl,
    p.status,
    inlinks.get(p.prodUrl) ?? 0,
    p.parsed ? new Set(p.parsed.links.map((l) => l.prod).filter(Boolean)).size : 0,
    Number.isFinite(depth.get(p.prodUrl)) ? depth.get(p.prodUrl) : "unreachable",
  ])
);

// orphan-pages.csv
writeCsv(
  `orphan-pages-${LABEL}.csv`,
  ["url", "inlinks", "clickDepth", "reason"],
  orphans.map((u) => [u, inlinks.get(u) ?? 0, Number.isFinite(depth.get(u)) ? depth.get(u) : "unreachable", "No crawlable inbound <a href> from any audited page"])
);

// Split the sitemap into per-<url> blocks once so each loc's alternate count
// is scoped to its own entry (a greedy regex from the first <url> would
// accumulate counts across all preceding entries).
const sitemapUrlBlocks = smHtml
  .split(/<url>/)
  .slice(1)
  .map((block) => block.split(/<\/url>/)[0]);
const alternatesByLoc = new Map(
  sitemapUrlBlocks.map((block) => {
    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1];
    return [loc, (block.match(/xhtml:link/g) ?? []).length];
  })
);

// sitemap-audit.csv
writeCsv(
  `sitemap-audit-${LABEL}.csv`,
  ["sitemapLoc", "alternateCountInEntry", "status", "canonicalOnPage", "canonicalMatchesLoc"],
  sitemapLocs.map((loc) => {
    const prod = toProdSpace(loc.replace(PROD_ORIGIN, BASE_URL)) ?? "";
    const p = pageMap.get(prod);
    return [
      loc,
      alternatesByLoc.get(loc) ?? 0,
      p?.status ?? "not-fetched",
      p?.parsed?.canonical ?? "",
      p?.parsed?.canonical === loc ? "yes" : "no",
    ];
  })
);

// schema-coverage.csv
writeCsv(
  `schema-coverage-${LABEL}.csv`,
  ["url", "locale", "jsonldTypes"],
  pages
    .filter((p) => p.parsed && (p.parsed.jsonldTypes.length > 0))
    .map((p) => {
      const u = new URL(p.prodUrl);
      return [p.prodUrl, localeOfProdUrl(u), (p.parsed.jsonldTypes ?? []).join("|")];
    })
);

// robots.txt check
const robotsRes = await fetchText(`${BASE_URL}/robots.txt`);
const robotsHasSitemap = /sitemap:/i.test(robotsRes.body);

// markdown summary
const counts = { P1: 0, P2: 0, P3: 0 };
for (const i of issues) counts[i.severity]++;
const md = [
  `# WallHaze SEO audit — ${LABEL}`,
  "",
  `- Base URL: ${BASE_URL}`,
  `- Sitemap loc entries: ${sitemapLocs.length} (alternates rendered: ${sitemapAltCount})`,
  `- Audited URL universe: ${urls.length}`,
  `- Fetched OK: ${pages.filter((p) => p.status === 200).length}`,
  `- Robots.txt sitemap declared: ${robotsHasSitemap ? "yes" : "NO"}`,
  `- Issues: P1=${counts.P1} P2=${counts.P2} P3=${counts.P3}`,
  `- Orphan indexable pages: ${orphans.length}`,
  `- Broken link targets (non-200): ${brokenKnown.length} known + ${unknownBroken.size} unknown`,
  "",
  "## Issues",
  "",
  ...issues.map((i) => `- [${i.severity}] ${i.id} ${i.locale} ${i.field}: ${i.problem} — \`${i.currentValue.slice(0, 120)}\` (${i.url})`),
  "",
  "## Orphan pages",
  "",
  ...(orphans.length ? orphans.map((u) => `- ${u}`) : ["(none)"]),
  "",
  "## Broken links",
  "",
  ...(brokenKnown.length ? brokenKnown.map(([u, s]) => `- ${u} → ${s}`) : ["(none among sitemap URLs)"]),
  ...([...unknownBroken].map(([u, s]) => `- ${u} → ${s} (outside sitemap universe)`)),
].join("\r\n");
writeFileSync(path.join(OUT_DIR, `seo-report-${LABEL}.md`), md, "utf8");

console.log(`[seo-audit] done: P1=${counts.P1} P2=${counts.P2} P3=${counts.P3} orphans=${orphans.length} brokenKnown=${brokenKnown.length} brokenUnknown=${unknownBroken.size}`);
console.log(`[seo-audit] output → ${OUT_DIR}`);

process.exit(counts.P1 > 0 ? 1 : 0);
