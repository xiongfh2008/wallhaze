// Metadata stats: title/description lengths + duplicates across the universe.
// Complements seo-final-review.mjs (which checks presence, not length bands).
const BASE = "http://127.0.0.1:3100";
const PROD = "https://wallhaze.com";
const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
const locs = [...new Set([...sm.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1].match(/<loc>([\s\S]*?)<\/loc>/)[1].trim()))];
const pages = [];
let i = 0;
async function worker() {
  while (i < locs.length) {
    const loc = locs[i++];
    const res = await fetch(loc.replace(PROD, BASE)).catch(() => null);
    if (!res || res.status !== 200) { pages.push({ loc, status: res ? res.status : 0 }); continue; }
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").trim();
    const desc = (html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i)?.[1] ?? html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"/i)?.[1] ?? "")
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").trim();
    pages.push({ loc, status: 200, title, titleLen: title.length, desc, descLen: desc.length });
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log("fetched", pages.length);
const ok = pages.filter((p) => p.status === 200);
const byLen = (arr, lo, hi) => arr.filter((p) => p.titleLen >= lo && p.titleLen <= hi).length;
console.log("== TITLE ==");
console.log("missing:", ok.filter((p) => !p.title).length);
console.log("dup titles:", ok.length - new Set(ok.map((p) => p.title)).size);
console.log("len<35:", ok.filter((p) => p.titleLen < 35).length, "| 35-60:", byLen(ok, 35, 60), "| 61-70:", ok.filter((p) => p.titleLen > 60 && p.titleLen <= 70).length, "| >70:", ok.filter((p) => p.titleLen > 70).length);
console.log("== DESCRIPTION ==");
console.log("missing:", ok.filter((p) => !p.desc).length);
console.log("dup descs:", ok.length - new Set(ok.map((p) => p.desc)).size);
console.log("len<70:", ok.filter((p) => p.descLen > 0 && p.descLen < 70).length, "| 70-109:", ok.filter((p) => p.descLen >= 70 && p.descLen < 110).length, "| 110-160:", ok.filter((p) => p.descLen >= 110 && p.descLen <= 160).length, "| 161-165:", ok.filter((p) => p.descLen > 160 && p.descLen <= 165).length, "| >165:", ok.filter((p) => p.descLen > 165).length);
console.log("== OUTLIERS ==");
for (const p of ok.filter((p) => p.titleLen > 70).slice(0, 12)) console.log("TITLE>70", p.titleLen, p.loc, JSON.stringify(p.title));
for (const p of ok.filter((p) => p.titleLen < 35).slice(0, 12)) console.log("TITLE<35", p.titleLen, p.loc, JSON.stringify(p.title));
for (const p of ok.filter((p) => p.descLen > 165).slice(0, 12)) console.log("DESC>165", p.descLen, p.loc);
for (const p of ok.filter((p) => p.descLen > 0 && p.descLen < 70).slice(0, 12)) console.log("DESC<70", p.descLen, p.loc);
const dups = {};
for (const p of ok) { (dups[p.title] ??= []).push(p.loc); }
for (const [t, ls] of Object.entries(dups)) if (ls.length > 1) console.log("DUP-TITLE", JSON.stringify(t), "->", ls.slice(0, 4).join(" , "), `(${ls.length})`);
