// Waffo compliance regression — RAW HTML / RSC payload layer.
// Checks forbidden claims + required markers inside the full response body
// (including <script> RSC flight data), across 11 paths x 7 locales.
const BASE = "http://127.0.0.1:3100";
const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"];
const PREFIX = { en: "", zh: "/zh", ja: "/ja", ko: "/ko", es: "/es", fr: "/fr", de: "/de" };
const PATHS = ["/", "/contact", "/terms", "/privacy", "/faq", "/help", "/about", "/studio", "/pricing", "/acceptable-use", "/community"];

const FORBIDDEN = [
  { re: /start\s+creating/i, why: "AI-generation-available claim" },
  { re: /no\s+official\s+(customer\s+)?(support|service)\s+channel/i, why: "absence-of-support claim" },
  { re: /buy\s+credits?\s+now/i, why: "credits purchase open" },
];
const findings = [];
const rows = [];
for (const path of PATHS) {
  for (const locale of LOCALES) {
    const local = BASE + (PREFIX[locale] || "/") + (path === "/" && PREFIX[locale] ? "" : path);
    const res = await fetch(local);
    const raw = await res.text();
    const row = { path, locale, status: res.status };
    for (const f of FORBIDDEN) {
      if (f.re.test(raw)) {
        findings.push({ path, locale, layer: "raw-html/rsc", issue: f.why, re: f.re.source });
        row[f.why] = "VIOLATION";
      }
    }
    // "Coming Soon" must only appear on /studio
    if (path !== "/studio" && /coming\s+soon/i.test(raw)) {
      findings.push({ path, locale, layer: "raw-html/rsc", issue: "Coming Soon outside /studio" });
      row.comingSoon = "OUTSIDE_STUDIO";
    }
    if (path === "/contact" && !/hello@wallhaze\.com/i.test(raw)) {
      findings.push({ path, locale, layer: "raw-html/rsc", issue: "official email missing" });
      row.email = "MISSING";
    }
    if (path === "/terms" && !/120/i.test(raw)) {
      findings.push({ path, locale, layer: "raw-html/rsc", issue: "120-day refund marker missing in raw HTML" });
      row.refund120 = "MISSING";
    }
    if (path === "/terms" && !/refund/i.test(raw)) {
      findings.push({ path, locale, layer: "raw-html/rsc", issue: "refund wording missing in raw HTML" });
      row.refund = "MISSING";
    }
    if (path === "/studio" && !/coming\s+soon/i.test(raw)) {
      findings.push({ path, locale, layer: "raw-html/rsc", issue: "studio lacks Coming Soon" });
      row.studio = "MISSING_COMING_SOON";
    }
    rows.push(row);
  }
}
console.log("pages checked:", rows.length);
console.log("findings:", findings.length);
for (const f of findings) console.log(JSON.stringify(f));
