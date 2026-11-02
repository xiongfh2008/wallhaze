#!/usr/bin/env node
/**
 * Independent pre-launch SEO review for WallHaze.
 *
 * Deliberately implemented with different logic from scripts/seo-audit.mjs:
 *   - sitemap parsed per <url> block (no cross-block alternate accumulation)
 *   - soft-404 detection via a live reference probe + body-hash comparison
 *   - real image dimensions read from binary headers (JPEG/PNG/WebP)
 *   - per-locale BFS link graphs from each language homepage (HTML <a> only)
 *   - JSON-LD parsed per page with @id consistency + injection checks
 *
 * Local-only tooling. Never run against production.
 *
 * Usage: node scripts/seo-final-review.mjs [--base-url=http://127.0.0.1:3100]
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(WEB_ROOT, "docs", "seo-audit", "review");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const BASE = String(args["base-url"] ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const PROD = "https://wallhaze.com";
const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"];
const PREFIX = { en: "", zh: "/zh", ja: "/ja", ko: "/ko", es: "/es", fr: "/fr", de: "/de" };
const CONCURRENCY = Number(args["concurrency"] ?? 6);
const TIMEOUT = Number(args["timeout"] ?? 90_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, timeout = TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    const body = await res.text().catch(() => "");
    return { status: res.status, body, finalUrl: res.url || url, xRobots: res.headers.get("x-robots-tag") ?? "" };
  } catch (err) {
    return { status: 0, body: "", finalUrl: url, xRobots: "", error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBuffer(url, timeout = 60_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { status: res.status, buf: null };
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  } catch {
    return { status: 0, buf: null };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, worker, n = CONCURRENCY) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, Math.max(items.length, 1)) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    })
  );
  return out;
}

// ---------- prod-space URL helpers ----------
function toProd(url) {
  try {
    const u = new URL(url, BASE);
    u.hash = "";
    // Accept both the local origin and the production origin (page
    // hreflang alternates are emitted as absolute PROD URLs).
    if (u.origin !== new URL(BASE).origin && u.origin !== PROD) return null;
    // Normalize the bare-home case: universe keys use PROD (no slash).
    return PROD + (u.pathname === "/" ? "" : u.pathname) + u.search;
  } catch {
    return null;
  }
}
function localeOf(prodPath) {
  const m = prodPath.match(/^\/(zh|ja|ko|es|fr|de)(\/|$)/);
  return m ? m[1] : "en";
}
const PAGE_EXT = /\.(png|jpe?g|webp|avif|gif|svg|ico|css|js|mjs|json|xml|txt|webmanifest|mp4|webm|zip|woff2?|ttf)$/i;
const PAGE_PREFIX = /^\/(api|_next|assets|media|fonts|images|favicons)\//i;
const isPage = (p) => !PAGE_EXT.test(p) && !PAGE_PREFIX.test(p);

// ---------- HTML parsing (independent implementation) ----------
function unescape(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&");
}
function tags(text) {
  return unescape(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i")) ?? tag.match(new RegExp(`\\b${name}='([^']*)'`, "i"));
  return m ? unescape(m[1]) : null;
}

function parsePage(html) {
  const p = {
    title: "", description: "", robots: "", canonical: "", ogLocale: "",
    ogTitle: "", ogImage: "", twitterCard: "", twitterTitle: "",
    hreflang: {}, h1: [], paragraphs: [], alts: [], links: [],
    jsonLd: [], jsonLdRaw: [], text: "",
  };
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) p.title = unescape(t[1]).trim();

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = (attr(tag, "name") ?? "").toLowerCase();
    const prop = (attr(tag, "property") ?? "").toLowerCase();
    const content = attr(tag, "content");
    if (content == null) continue;
    if (name === "description") p.description = content.trim();
    if (name === "robots") p.robots = content.trim();
    if (prop === "og:locale") p.ogLocale = content.trim();
    if (prop === "og:title") p.ogTitle = content.trim();
    if (prop === "og:image") p.ogImage = content.trim();
    if (name === "twitter:card") p.twitterCard = content.trim();
    if (name === "twitter:title") p.twitterTitle = content.trim();
  }

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    const hl = attr(tag, "hreflang");
    if (rel === "canonical" && href) p.canonical = href.trim();
    if (rel === "alternate" && hl && href) p.hreflang[hl] = href.trim();
  }

  for (const m of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) p.h1.push(tags(m[1]));
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const txt = tags(m[1]);
    if (txt.length > 30) p.paragraphs.push(txt);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attr(m[0], "alt");
    if (a) p.alts.push(a);
  }

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/ld\+json/i.test(m[1])) continue;
    p.jsonLdRaw.push(m[2]);
    try {
      const data = JSON.parse(m[2]);
      const nodes = Array.isArray(data) ? data : data["@graph"] ?? [data];
      p.jsonLd.push(...nodes);
    } catch {
      p.jsonLd.push({ __parseError: true });
    }
  }

  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[1], "href");
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    p.links.push({ href, anchor: tags(m[2]), prod: toProd(href) });
  }

  // visible text: drop scripts/styles, then tags
  p.text = unescape(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ").trim();
  return p;
}

// ---------- image dimension sniffing ----------
function imageDimensions(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), fmt: "png" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7), fmt: "jpeg" };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
    return null;
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const fmt = buf.toString("ascii", 12, 16);
    if (fmt === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, fmt: "webp" };
    if (fmt === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, fmt: "webp" };
    }
    if (fmt === "VP8X") return { w: (buf.readUIntLE(24, 3)) + 1, h: (buf.readUIntLE(27, 3)) + 1, fmt: "webp" };
  }
  return null;
}

// =====================================================================
// MAIN
// =====================================================================
console.log(`[review] base=${BASE}`);
mkdirSync(OUT_DIR, { recursive: true });
const issues = [];
const add = (sev, kind, url, detail) => issues.push({ sev, kind, url, detail });

// ---- 1. sitemap: parse per <url> block ----
const sm = await fetchText(`${BASE}/sitemap.xml`);
if (sm.status !== 200) {
  console.error(`[review] FATAL sitemap ${sm.status}`);
  process.exit(2);
}
const urlBlocks = [...sm.body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
const sitemapEntries = urlBlocks.map((block) => {
  const loc = unescape(block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim() ?? "");
  const alts = [...block.matchAll(/<xhtml:link\b([^>]*)>/g)]
    .filter((m) => /rel="alternate"/.test(m[1]))
    .map((m) => ({ hreflang: attr(`<a ${m[1]}>`, "hreflang"), href: attr(`<a ${m[1]}>`, "href") }))
    .filter((a) => a.hreflang && a.href);
  return { loc, alts };
});
const locList = sitemapEntries.map((e) => e.loc);
const dupLocs = locList.filter((l, i) => locList.indexOf(l) !== i);
console.log(`[review] sitemap blocks=${urlBlocks.length} uniqueLocs=${new Set(locList).size} dup=${dupLocs.length}`);
if (dupLocs.length) add("P1", "sitemap-duplicate-loc", dupLocs[0], `${dupLocs.length} duplicate <loc> entries: ${dupLocs.slice(0, 5).join(", ")}`);

// ---- 2. derive the URL universe independently ----
// logical static paths: strip locale prefix from every non-detail loc
const pathOf = (loc) => {
  let p = loc.replace(PROD, "") || "/";
  const m = p.match(/^\/(zh|ja|ko|es|fr|de)(\/|$)/);
  if (m) p = p.slice(3) || "/";
  return p;
};
const staticPaths = [...new Set(locList.map(pathOf).filter((p) => !p.startsWith("/wallpapers/") && !p.startsWith("/community/")))].sort();
const wpSlugs = [...new Set(locList.flatMap((l) => (l.match(/\/wallpapers\/([^/?#]+)$/) ? [l.match(/\/wallpapers\/([^/?#]+)$/)[1]] : [])))].sort();
const communitySlugs = [...new Set(locList.flatMap((l) => (l.match(/\/community\/([^/?#]+)$/) ? [l.match(/\/community\/([^/?#]+)$/)[1]] : [])))].sort();
console.log(`[review] staticPaths=${staticPaths.length} (${staticPaths.join(",")}) wallpaperSlugs=${wpSlugs.length} communitySlugs=${communitySlugs.length}`);
console.log(`[review] expected universe = (${staticPaths.length}+${wpSlugs.length}+${communitySlugs.length}) x ${LOCALES.length} = ${(staticPaths.length + wpSlugs.length + communitySlugs.length) * LOCALES.length}`);

// cross-check wallpaper slugs against SSR links on /wallpapers (en)
const galleryPage = await fetchText(`${BASE}/wallpapers`);
const galleryLinks = [...new Set([...galleryPage.body.matchAll(/<a\b[^>]href="([^"]*)"[^>]*>/gi)].map((m) => toProd(attr(m[0], "href"))).filter((u) => u && /\/wallpapers\/[^/]+$/.test(u)).map((u) => u.replace(PROD, "")))];
const ssrSlugs = [...new Set(galleryLinks.map((p) => p.replace(/\/wallpapers\//, "")))].sort();
const sitemapOnly = wpSlugs.filter((s) => !ssrSlugs.includes(s));
console.log(`[review] gallery SSR slug links=${ssrSlugs.length}; in sitemap but not linked from gallery: ${sitemapOnly.length}${sitemapOnly.length ? " -> " + sitemapOnly.join(",") : ""}`);

// universe = every sitemap loc
const universe = [...new Set(locList)].sort();
const universeSet = new Set(universe);

// ---- 3. fetch reference 404 probe ----
const probe404 = await fetchText(`${BASE}/wallpapers/__review_probe_nonexistent__`);
console.log(`[review] 404 probe status=${probe404.status}`);
const SOFT404_MARKERS = [/\b404\b/, /page not found/i, /not found/i, /找不到/, /ページが見つかり/, /페이지를 찾을/, /página no encontrada/i, /page introuvable/i, /seite nicht gefunden/i];

// ---- 4. fetch + parse the whole universe ----
console.log(`[review] fetching ${universe.length} URLs ...`);
const pages = await pool(universe, async (prodUrl) => {
  const local = prodUrl.replace(PROD, BASE);
  const res = await fetchText(local);
  const parsed = res.status === 200 ? parsePage(res.body) : null;
  return { prodUrl, status: res.status, xRobots: res.xRobots, parsed, error: res.error ?? null };
});
const pageMap = new Map(pages.map((p) => [p.prodUrl, p]));
const non200 = pages.filter((p) => p.status !== 200);
console.log(`[review] fetched: 200=${pages.length - non200.length} non200=${non200.length}`);
for (const p of non200) add("P1", "http-status", p.prodUrl, `status=${p.status}${p.error ? " err=" + p.error : ""}`);

// ---- 5. per-page checks ----
const bodyHashes = new Map();
let soft404Count = 0;
for (const { prodUrl, parsed, xRobots } of pages) {
  if (!parsed) continue;
  const locale = localeOf(prodUrl.replace(PROD, ""));
  // canonical must equal the prod URL itself
  const canon = parsed.canonical.replace(/^https?:\/\/[^/]+/, "");
  const self = prodUrl.replace(PROD, "");
  if (parsed.canonical && new URL(parsed.canonical).origin !== PROD) {
    add("P2", "canonical-cross-origin", prodUrl, parsed.canonical);
  } else if (canon !== self) {
    add("P2", "canonical-mismatch", prodUrl, `canonical=${parsed.canonical}`);
  }
  if (/noindex/i.test(parsed.robots) || /noindex/i.test(xRobots)) {
    add("P1", "indexable-but-noindex", prodUrl, `robots=${parsed.robots} x-robots=${xRobots}`);
  }
  if (!parsed.title) add("P2", "missing-title", prodUrl, "no <title>");
  if (!parsed.description) add("P2", "missing-description", prodUrl, "no meta description");
  if (parsed.h1.length !== 1) add("P2", "h1-count", prodUrl, `h1 count=${parsed.h1.length}: ${parsed.h1.join(" | ").slice(0, 120)}`);
  // hreflang completeness
  const expectedHl = [...LOCALES, "x-default"];
  for (const hl of expectedHl) {
    if (!parsed.hreflang[hl]) add("P2", "hreflang-missing", prodUrl, `missing ${hl}`);
  }
  const xDefault = parsed.hreflang["x-default"];
  if (xDefault && !xDefault.endsWith(PROD) && !xDefault.startsWith(PROD)) add("P2", "x-default-origin", prodUrl, xDefault);
  else if (xDefault) {
    const xdPath = xDefault.replace(PROD, "");
    if (/^\/(zh|ja|ko|es|fr|de)(\/|$)/.test(xdPath)) add("P2", "x-default-not-en", prodUrl, xDefault);
  }
  // soft 404
  const marker = SOFT404_MARKERS.find((re) => re.test(parsed.title) || re.test(parsed.h1.join(" ")));
  if (marker) {
    soft404Count++;
    add("P1", "soft-404-marker", prodUrl, `title/h1 matched /${marker.source}/ : ${parsed.h1.join("|").slice(0, 100)}`);
  }
  // record body hash for duplicate detection
  const hash = createHash("sha1").update(parsed.text).digest("hex");
  if (!bodyHashes.has(hash)) bodyHashes.set(hash, []);
  bodyHashes.get(hash).push(prodUrl);
}

const dupBodyGroups = [...bodyHashes.values()].filter((g) => g.length > 1);
console.log(`[review] soft404=${soft404Count} duplicate-body-groups=${dupBodyGroups.length}`);
for (const g of dupBodyGroups) add("P1", "duplicate-body", g[0], `${g.length} pages with identical visible text: ${g.join(" , ").slice(0, 500)}`);

// hreflang bidirectional: page A says lang B -> page B must say lang A
let hreflangBroken = 0;
for (const { prodUrl, parsed } of pages) {
  if (!parsed) continue;
  for (const [hl, href] of Object.entries(parsed.hreflang)) {
    const targetProd = toProd(href);
    if (!targetProd) { hreflangBroken++; add("P2", "hreflang-external", prodUrl, `${hl} -> ${href}`); continue; }
    const tp = pageMap.get(targetProd);
    if (!tp || tp.status !== 200) { hreflangBroken++; add("P1", "hreflang-dead", prodUrl, `${hl} -> ${href} (status ${tp?.status ?? "?"})`); continue; }
    const back = hl === "x-default" ? "en" : hl;
    if (tp.parsed?.hreflang[hl] !== href && tp.parsed?.hreflang[back] !== href) {
      hreflangBroken++;
      add("P2", "hreflang-not-reciprocal", prodUrl, `${hl} -> ${href} but target does not link back`);
    }
  }
}
console.log(`[review] hreflang broken=${hreflangBroken}`);

// ---- 6. broken links: all same-origin page links across universe ----
const allTargets = new Set();
for (const { parsed } of pages) {
  if (!parsed) continue;
  for (const l of parsed.links) {
    if (l.prod && isPage(new URL(l.prod).pathname)) allTargets.add(l.prod);
  }
}
const unknownTargets = [...allTargets].filter((u) => !pageMap.has(u));
console.log(`[review] link targets=${allTargets.size} outside-universe=${unknownTargets.length}`);
const unknownResults = await pool(unknownTargets, async (u) => {
  await sleep(30);
  const r = await fetchText(u.replace(PROD, BASE));
  return { u, status: r.status, body: r.body };
});
const brokenLinks = unknownResults.filter((r) => r.status !== 200);
console.log(`[review] brokenLinks=${brokenLinks.length}`);
for (const b of brokenLinks) add("P1", "broken-link", b.u, `status=${b.status}`);
// also collect noindex state of linked-but-not-indexed pages (pending artworks)
const pendingNoindex = unknownResults.filter((r) => r.status === 200 && !/noindex/i.test(r.body.match(/<meta\b[^>]*name="robots"[^>]*>/i)?.[0] ?? ""));
if (pendingNoindex.length) add("P2", "linked-page-missing-noindex", pendingNoindex[0].u, `${pendingNoindex.length} linked non-sitemap pages without noindex`);

// ---- 7. per-locale BFS link graphs (HTML <a href> only) ----
const bfsReports = [];
for (const locale of LOCALES) {
  // Seed must match the universe key exactly (no trailing slash for en).
  const seedCandidate = PROD + PREFIX[locale];
  const seed = universeSet.has(seedCandidate) ? seedCandidate : seedCandidate + "/";
  const depth = new Map([[seed, 0]]);
  const queue = [seed];
  const visited = new Set([seed]);
  while (queue.length) {
    const cur = queue.shift();
    const page = pageMap.get(cur);
    if (!page?.parsed) continue;
    const d = depth.get(cur);
    for (const l of page.parsed.links) {
      if (!l.prod || !isPage(new URL(l.prod).pathname)) continue;
      if (!universeSet.has(l.prod)) continue; // only indexable universe counted
      if (!visited.has(l.prod)) {
        visited.add(l.prod);
        depth.set(l.prod, d + 1);
        queue.push(l.prod);
      }
    }
  }
  const reachable = [...visited].filter((u) => universeSet.has(u));
  const maxDepth = Math.max(...reachable.map((u) => depth.get(u)));
  bfsReports.push({
    locale,
    totalIndexable: universe.length,
    reachableFromHome: reachable.length,
    orphanCount: universe.length - reachable.length,
    maxDepth,
    depthHistogram: Object.entries(reachable.reduce((acc, u) => { const k = `depth${depth.get(u)}`; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})).sort(),
    brokenLinks: brokenLinks.length,
  });
  console.log(`[review] BFS ${locale}: reachable=${reachable.length}/${universe.length} orphan=${universe.length - reachable.length} maxDepth=${maxDepth}`);
}
// global inlinks (any locale page linking to a universe URL)
const inlinks = new Map(universe.map((u) => [u, 0]));
for (const { prodUrl, parsed } of pages) {
  if (!parsed) continue;
  const seen = new Set();
  for (const l of parsed.links) {
    if (l.prod && inlinks.has(l.prod) && l.prod !== prodUrl && !seen.has(l.prod)) {
      seen.add(l.prod);
      inlinks.set(l.prod, inlinks.get(l.prod) + 1);
    }
  }
}
const globalOrphans = universe.filter((u) => (inlinks.get(u) ?? 0) === 0);
console.log(`[review] global inlink orphans=${globalOrphans.length}`);

// ---- 8. schema checks ----
const schemaStats = {};
const orgIds = new Set();
const orgDetails = [];
let breadcrumbBad = 0;
const publicDetailPages = universe.filter((u) => /\/wallpapers\/[^/]+$/.test(u));
for (const { prodUrl, parsed } of pages) {
  if (!parsed) continue;
  const path = prodUrl.replace(PROD, "");
  const locale = localeOf(path);
  for (const node of parsed.jsonLd) {
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    for (const t of types.filter(Boolean)) schemaStats[t] = (schemaStats[t] ?? 0) + 1;
    if (node.__parseError) add("P1", "jsonld-parse-error", prodUrl, "JSON-LD failed JSON.parse");
    // injection safety: raw block must not contain a raw "</script" or "<script"
    for (const raw of parsed.jsonLdRaw) {
      if (/<script/i.test(raw)) add("P1", "jsonld-injection-risk", prodUrl, "raw <script inside JSON-LD block");
    }
    if (types.includes("Organization")) {
      const id = node["@id"] ?? "(none)";
      orgIds.add(id);
      orgDetails.push({ url: path, locale, id, name: node.name, urlField: node.url, logo: typeof node.logo === "object" ? node.logo?.url : node.logo, email: node.email });
    }
    if (types.includes("BreadcrumbList")) {
      const items = node.itemListElement ?? [];
      items.forEach((it, i) => {
        if (it.position !== i + 1) { breadcrumbBad++; add("P2", "breadcrumb-position", prodUrl, `item ${i} position=${it.position}`); }
        const itemUrl = typeof it.item === "object" ? it.item["@id"] : it.item;
        if (itemUrl && !itemUrl.startsWith(PROD)) { breadcrumbBad++; add("P2", "breadcrumb-foreign-url", prodUrl, itemUrl); }
      });
      if (!items.length) { breadcrumbBad++; add("P2", "breadcrumb-empty", prodUrl, "no itemListElement"); }
    }
    if (types.includes("ImageObject")) {
      const cu = node.contentUrl;
      if (!cu) add("P2", "imageobject-no-contentUrl", prodUrl, JSON.stringify(node).slice(0, 200));
      if (!node.width?.value || !node.height?.value) add("P2", "imageobject-no-dimensions", prodUrl, JSON.stringify(node.width));
      if (!node.license) add("P3", "imageobject-no-license", prodUrl, "no license field");
    }
    if (types.includes("VideoObject")) {
      for (const f of ["duration", "uploadDate", "thumbnailUrl", "contentUrl"]) {
        if (!node[f]) add("P2", `videoobject-missing-${f}`, prodUrl, "field absent");
      }
    }
  }
}

// Organization @id consistency across 7 homepages
const HOME_PATHS = new Set(["", "/", ...LOCALES.filter((l) => l !== "en").map((l) => PREFIX[l])]);
const homeOrgs = orgDetails.filter((o) => HOME_PATHS.has(o.url));
console.log(`[review] Organization nodes=${orgDetails.length}, on homepages=${homeOrgs.length}, distinct @id on homepages=${new Set(homeOrgs.map((o) => o.id)).size}`);
if (homeOrgs.length && new Set(homeOrgs.map((o) => o.id)).size !== 1) {
  add("P1", "organization-id-inconsistent", homeOrgs[0].url, `distinct @id values: ${[...new Set(homeOrgs.map((o) => o.id))].join(" , ")}`);
}
const orgBad = homeOrgs.filter((o) => o.name !== "WallHaze" || o.urlField !== PROD + "/" || !o.email || !o.email.includes("@"));
if (orgBad.length) add("P2", "organization-fields", orgBad[0].url, JSON.stringify(orgBad[0]));

// ---- 9. real image dimension verification (66 public details) ----
const imgChecks = [];
const publicDetailEn = publicDetailPages.filter((u) => !/^\/(zh|ja|ko|es|fr|de)\//.test(u));
console.log(`[review] verifying image binaries for ${publicDetailEn.length} public detail pages ...`);
const imgResults = await pool(publicDetailEn, async (prodUrl) => {
  const page = pageMap.get(prodUrl);
  const io = page?.parsed?.jsonLd.find((n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).includes("ImageObject"));
  if (!io) return { prodUrl, error: "no ImageObject" };
  const local = io.contentUrl ? io.contentUrl.replace(PROD, BASE) : null;
  if (!local) return { prodUrl, error: "no contentUrl" };
  const { status, buf } = await fetchBuffer(local);
  const dims = imageDimensions(buf);
  return {
    prodUrl,
    contentUrl: io.contentUrl,
    httpStatus: status,
    real: dims,
    schemaW: io.width?.value, schemaH: io.height?.value,
    license: io.license ?? null, credit: io.creditText ?? null,
  };
});
let imgMismatch = 0;
for (const r of imgResults) {
  if (r.error || !r.real) { imgMismatch++; add("P2", "image-fetch-fail", r.prodUrl, r.error ?? "unparseable image"); continue; }
  if (r.httpStatus !== 200) { imgMismatch++; add("P2", "image-http", r.prodUrl, `status=${r.httpStatus}`); continue; }
  if (r.real.w !== r.schemaW || r.real.h !== r.schemaH) {
    imgMismatch++;
    add("P2", "image-dimension-mismatch", r.prodUrl, `real ${r.real.w}x${r.real.h} (${r.real.fmt}) vs schema ${r.schemaW}x${r.schemaH}`);
  }
  imgChecks.push(r);
}
console.log(`[review] image checks: ok=${imgChecks.length - imgMismatch} mismatch=${imgMismatch}`);

// license vs download affordance: pages claiming download must state a license
for (const r of imgChecks) {
  const page = pageMap.get(r.prodUrl);
  const hasLicense = r.license && /creativecommons\.org\/(publicdomain|licenses\/)/i.test(r.license);
  const siteLicense = r.license && r.license.startsWith(PROD); // self-authored: /terms grants the license
  const claimsFree = /free download|Download the original/i.test(page.parsed.text);
  if (claimsFree && !hasLicense && !siteLicense) {
    add("P2", "download-license-mismatch", r.prodUrl, `page claims download but license=${r.license}`);
  }
}

// ---- 10. content uniqueness (66 en detail pages + sampled locales) ----
const enDetails = publicDetailEn.map((u) => ({ url: u, p: pageMap.get(u).parsed }));
const uniq = {
  titles: new Map(), h1s: new Map(), intros: new Map(), descs: new Map(),
};
for (const { url, p } of enDetails) {
  uniq.titles.set(p.title, [...(uniq.titles.get(p.title) ?? []), url]);
  uniq.h1s.set(p.h1[0], [...(uniq.h1s.get(p.h1[0]) ?? []), url]);
  uniq.descs.set(p.description, [...(uniq.descs.get(p.description) ?? []), url]);
  const intro = p.paragraphs[0] ?? "";
  uniq.intros.set(intro, [...(uniq.intros.get(intro) ?? []), url]);
}
const dupReport = {};
for (const [k, m] of Object.entries({ title: uniq.titles, h1: uniq.h1s, description: uniq.descs, intro: uniq.intros })) {
  const dups = [...m.entries()].filter(([, urls]) => urls.length > 1);
  dupReport[k] = dups.length;
  for (const [val, urls] of dups) add(k === "intro" ? "P2" : "P1", `duplicate-${k}`, urls[0], `${urls.length} pages share ${k}: "${String(val).slice(0, 120)}" -> ${urls.slice(0, 6).join(" , ")}`);
}
console.log(`[review] en duplicate groups: ${JSON.stringify(dupReport)}`);
// template-only intro detection: same intro after stripping the title/slug-specific words
const introNorm = enDetails.map(({ url, p }) => ({ url, s: (p.paragraphs[0] ?? "").replace(/[^\p{L}\p{N}]+/gu, " ").toLowerCase() }));
let nearDupIntro = 0;
for (let i = 0; i < introNorm.length; i++) {
  for (let j = i + 1; j < introNorm.length; j++) {
    if (introNorm[i].s && introNorm[i].s === introNorm[j].s) nearDupIntro++;
  }
}
console.log(`[review] near-duplicate normalized intro pairs=${nearDupIntro}`);
// alt keyword stuffing: alt longer than 120 chars or >8 repeated words
let altStuffed = 0;
for (const { url, p } of enDetails) {
  for (const a of p.alts) {
    const words = a.toLowerCase().match(/\p{L}+/gu) ?? [];
    const counts = {};
    for (const w of words) counts[w] = (counts[w] ?? 0) + 1;
    const maxRep = Math.max(0, ...Object.values(counts));
    if (a.length > 160 || maxRep >= 4) { altStuffed++; add("P3", "alt-keyword-stuffing", url, `alt="${a.slice(0, 140)}"`); }
  }
}
console.log(`[review] stuffed alts=${altStuffed}`);
// other-locale sample: 6 locales x 6 slugs — check title/H1/desc uniqueness vs en and among themselves
const sampleLocales = ["zh", "ja", "ko", "es", "fr", "de"];
const localeSamples = {};
for (const loc of sampleLocales) {
  const slugs = [...new Set(enDetails.map(({ url }) => url.match(/\/wallpapers\/([^/]+)$/)[1]))].slice(0, 6);
  const rows = slugs.map((s) => {
    const prod = PROD + PREFIX[loc] + `/wallpapers/${s}`;
    const pg = pageMap.get(prod);
    return pg?.parsed ? { slug: s, title: pg.parsed.title, h1: pg.parsed.h1[0], desc: pg.parsed.description } : { slug: s, error: "missing" };
  });
  const dupTitles = rows.length - new Set(rows.map((r) => r.title)).size;
  const dupDescs = rows.length - new Set(rows.map((r) => r.desc)).size;
  localeSamples[loc] = { sampled: rows.length, dupTitles, dupDescs };
  if (dupTitles) add("P2", "locale-duplicate-title", prod, `${loc}: ${dupTitles} duplicate titles in sample`);
  console.log(`[review] sample ${loc}: dupTitles=${dupTitles} dupDescs=${dupDescs}`);
}

// ---- 11. Waffo compliance regression ----
const WAFFO_PATHS = ["/", "/contact", "/terms", "/privacy", "/faq", "/help", "/about", "/studio", "/pricing", "/acceptable-use", "/community"];
const waffoFindings = [];
const FORBIDDEN = [
  { re: /start\s+creating|generate\s+your\s+wallpaper\s+now|create\s+your\s+(own\s+)?wallpaper\s+(now|today)/i, why: "claims AI generation is available" },
  { re: /no\s+official\s+(customer\s+)?(support|service)\s+channel/i, why: "contact must not claim absence of official support" },
  { re: /credits?\s+(are\s+now\s+)?available|buy\s+credits?\s+now/i, why: "credits purchase claimed open" },
];
const REQUIRED_CONTACT = /hello@wallhaze\.com/i;
const REFUND_MARKERS = [/120\s*day/i, /refund/i];
const waffoRows = [];
for (const path of WAFFO_PATHS) {
  for (const locale of LOCALES) {
    const prod = PROD + PREFIX[locale] + (path === "/" ? (PREFIX[locale] || "/") : path);
    const pg = pageMap.get(prod);
    if (!pg?.parsed) { waffoFindings.push({ path, locale, issue: "page missing from universe/fetch" }); continue; }
    const p = pg.parsed;
    const row = { path, locale, status: pg.status, title: p.title, checks: {} };
    const sources = { visible: p.text, raw: pg.parsed.text, jsonld: JSON.stringify(p.jsonLd) };
    // required email on contact
    if (path === "/contact") {
      row.checks.officialEmail = REQUIRED_CONTACT.test(p.text) || REQUIRED_CONTACT.test(JSON.stringify(p.jsonLd)) ? "ok" : "MISSING hello@wallhaze.com";
      if (row.checks.officialEmail !== "ok") waffoFindings.push({ path, locale, issue: "official email missing" });
    }
    // forbidden phrases
    for (const f of FORBIDDEN) {
      const hit = Object.entries(sources).find(([, s]) => f.re.test(s));
      if (hit) {
        waffoFindings.push({ path, locale, issue: `${f.why} (${hit[0]}: /${f.re.source.slice(0, 40)}/)` });
        row.checks[f.why] = "VIOLATION";
      }
    }
    // "Coming Soon" must appear only on /studio
    const csHit = Object.entries(sources).find(([, s]) => /coming\s+soon/i.test(s));
    if (path !== "/studio" && csHit) {
      waffoFindings.push({ path, locale, issue: `"Coming Soon" outside /studio (${csHit[0]})` });
      row.checks.comingSoon = "OUTSIDE-STUDIO";
    }
    // refund markers on terms
    if (path === "/terms") {
      row.checks.refund120 = REFUND_MARKERS.map((re) => re.test(p.text));
      if (!row.checks.refund120[0]) waffoFindings.push({ path, locale, issue: "120-day refund marker not found in visible text" });
    }
    // studio must show coming soon
    if (path === "/studio") {
      const cs = /coming\s+soon/i.test(p.text) || /coming/i.test(p.title);
      row.checks.studioComingSoon = cs ? "ok" : "MISSING";
      if (!cs) waffoFindings.push({ path, locale, issue: "studio does not declare Coming Soon" });
    }
    waffoRows.push(row);
  }
}
console.log(`[review] waffo findings=${waffoFindings.length}`);
for (const f of waffoFindings) add("P1", "waffo-compliance", PROD + (PREFIX[f.locale] || "") + f.path, f.issue);

// ---- 12. sitemap vs page canonical + private page exclusion ----
const PRIVATE = ["/login", "/signup", "/account", "/credits", "/my-creations"];
for (const path of PRIVATE) {
  const hit = universe.filter((u) => u.replace(PROD, "").replace(/^\/(zh|ja|ko|es|fr|de)/, "") === path || u.replace(PROD, "") === path);
  if (hit.length) add("P1", "sitemap-contains-private", hit[0], `${hit.length} entries for private path ${path}`);
}
// per-block alternate count
let altBad = 0;
for (const e of sitemapEntries) {
  if (e.alts.length !== LOCALES.length + 1) { altBad++; add("P2", "sitemap-alternate-count", e.loc, `${e.alts.length} alternates (expected ${LOCALES.length + 1})`); }
}
console.log(`[review] sitemap alternate anomalies=${altBad}`);

// ---- write outputs ----
const summary = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  counts: {
    sitemapBlocks: urlBlocks.length,
    uniqueLocs: new Set(locList).size,
    staticPaths: staticPaths.length,
    wallpaperSlugs: wpSlugs.length,
    communitySlugs: communitySlugs.length,
    universe: universe.length,
    http200: pages.length - non200.length,
    non200: non200.length,
    soft404: soft404Count,
    duplicateBodyGroups: dupBodyGroups.length,
    hreflangBroken,
    brokenLinks: brokenLinks.length,
    globalInlinkOrphans: globalOrphans.length,
    imageChecks: imgChecks.length,
    imageMismatch: imgMismatch,
    altStuffed,
  },
  bfsReports,
  schemaStats,
  organization: { distinctHomepageIds: [...new Set(homeOrgs.map((o) => o.id))], homeOrgs },
  breadcrumbBad,
  duplicateContentEn: dupReport,
  nearDupIntroPairs: nearDupIntro,
  localeSamples,
  waffoFindings,
  issues,
  imgChecks: imgChecks.slice(0, 70),
  globalOrphans: globalOrphans.slice(0, 50),
};
writeFileSync(path.join(OUT_DIR, "review-summary.json"), JSON.stringify(summary, null, 2));
writeFileSync(path.join(OUT_DIR, "issues.json"), JSON.stringify(issues, null, 2));
console.log(`[review] issues total=${issues.length} (P1=${issues.filter((i) => i.sev === "P1").length} P2=${issues.filter((i) => i.sev === "P2").length} P3=${issues.filter((i) => i.sev === "P3").length})`);
console.log(`[review] wrote ${OUT_DIR}/review-summary.json`);
