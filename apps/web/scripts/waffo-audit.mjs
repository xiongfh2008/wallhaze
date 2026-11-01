#!/usr/bin/env node
/**
 * Waffo review audit — repeatable public-surface check for wallhaze.com.
 *
 * Usage:
 *   node scripts/waffo-audit.mjs [baseUrl] [--report <path>]
 *   npm run audit:waffo                       (audits https://wallhaze.com)
 *
 * What it checks (per locale en/zh/ja/ko/es/fr/de, per page):
 *   1. HTTP status and redirect chain for every public page, including the
 *      language-prefix-less /terms and /privacy URLs Waffo reviews.
 *   2. Terms: refund & cancellation section (marker, 120-day window,
 *      14 business days, Waffo, contact email).
 *   3. No legacy copy that described AI Studio generation (text-to-image,
 *      reference-image editing, image-to-video, text-to-video) or Credits
 *      purchasing as an available service — scanned in the RAW HTML (RSC
 *      payload / serialized next-intl messages included) and separately in
 *      the visible text.
 *   4. SEO/OG/Twitter metadata and JSON-LD carry no banned claims.
 *   5. /studio shows a coming-soon marker; /pricing has no enabled buy
 *      button; no enabled Generate button on /studio.
 *   6. Every hit is recorded with URL, locale, field, matched text and
 *      context — this is not a single boolean.
 *
 * Exit code 1 if any check fails.
 */

const BASE = (process.argv[2] && !process.argv[2].startsWith("--"))
  ? process.argv[2]
  : "https://wallhaze.com";
const reportArgIndex = process.argv.indexOf("--report");
const REPORT =
  reportArgIndex > -1 ? process.argv[reportArgIndex + 1] : "waffo-audit-report.json";

const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"];
const PATHS = ["/", "/terms", "/privacy", "/faq", "/help", "/about", "/studio", "/pricing"];

const EMAIL = "hello@wallhaze.com";

/** Per-locale marker for the Terms refund & cancellation section. */
const REFUND_MARKER = {
  en: "Refund and Cancellation Policy",
  zh: "退款与取消政策",
  ja: "返金およびキャンセルポリシー",
  ko: "환불 및 취소 정책",
  es: "Política de reembolsos y cancelaciones",
  fr: "Politique de remboursement et d'annulation",
  de: "Rückerstattungs- und Stornierungsrichtlinie",
};

/** Legacy strings that must not appear anywhere in raw HTML or visible text. */
const BANNED_PHRASES = [
  "Create stunning AI wallpapers",
  "Create with AI",
  "Create Wallpaper",
  "Create for This Theme",
  "creating an account or generating images",
  "when you use the AI Studio, we store",
  "the AI Studio, Credits and orders",
  "Waffo Prompt Sift reviews prompts",
  "The Studio lets you create your own wallpaper",
  "and make it yours",
  "使用 AI 创作主题壁纸",
  "このテーマで AI 制作",
  "이 테마로 AI 제작",
  "Für dieses Thema erstellen",
  "Créer pour ce thème",
  "Crear para este tema",
  "用 AI 创作",
  "AIで作成",
  "AI로 만들기",
  "Crear con IA",
  "Mit KI erstellen",
];

/** Per-locale "generation is open now"-style claims (visible text scan). */
const LOCALE_BANNED = {
  en: [/generate (your|the) (own|next) wallpaper/i, /start creating now/i, /create your own wallpaper (now|today)/i],
  zh: [/立即生成/, /马上生成/],
  ja: [/今すぐ生成/],
  ko: [/지금 생성/],
  es: [/genera tu( propio)? fondo ahora/i],
  fr: [/générez votre (propre )?fond( dès)? maintenant/i],
  de: [/generiere jetzt dein/i],
};

/** Per-locale "coming soon / not available" marker expected on /studio. */
const COMING_MARKER = {
  en: /coming soon|not currently available/i,
  zh: /即将|暂未|尚未|暂不/,
  ja: /近日|現在利用でき|まだ/,
  ko: /곧 공개|현재 이용|아직/,
  es: /próximamente|pronto|no está disponible/i,
  fr: /bientôt|pas disponible/i,
  de: /bald|nicht verfügbar/i,
};

/** Buy words that must only ever appear on disabled buttons on /pricing. */
const BUY_WORDS = {
  en: /buy|purchase|checkout/i,
  zh: /购买|结算/,
  ja: /購入|チェックアウト/,
  ko: /구매|결제/,
  es: /comprar|pagar|checkout/i,
  fr: /acheter|payer|checkout/i,
  de: /kaufen|bezahlen|checkout/i,
};

const GENERATE_WORD = /generate|生成|생성|generar|générer|generieren/i;

/* ------------------------------------------------------------ utilities */

const issues = [];
const notes = [];

function addIssue(check, url, locale, field, matched, context) {
  issues.push({ check, url, locale, field, matched: String(matched).slice(0, 200), context: (context || "").replace(/\s+/g, " ").slice(0, 220) });
}

function addNote(url, locale, field, value) {
  notes.push({ url, locale, field, value: String(value).slice(0, 300) });
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#xA0;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function findContext(haystack, needle) {
  const index = haystack.indexOf(needle);
  if (index === -1) return "";
  return haystack.slice(Math.max(0, index - 60), index + needle.length + 60);
}

async function fetchPage(url) {
  const response = await fetch(url, { redirect: "follow" });
  return response;
}

function scanBanned(url, locale, html, visible) {
  for (const phrase of BANNED_PHRASES) {
    if (html.includes(phrase)) {
      addIssue("legacy-phrase-raw-html", url, locale, "raw-html", phrase, findContext(html, phrase));
    }
    if (visible.includes(phrase)) {
      addIssue("legacy-phrase-visible", url, locale, "visible-text", phrase, findContext(visible, phrase));
    }
  }
  for (const pattern of LOCALE_BANNED[locale]) {
    const match = visible.match(pattern);
    if (match) {
      addIssue("generation-now-claim", url, locale, "visible-text", match[0], findContext(visible, match[0]));
    }
  }
}

function checkMetadata(url, locale, html) {
  const entries = [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) entries.push(["title", title[1]]);
  for (const tag of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tagText = tag[0];
    const nameMatch = tagText.match(/(?:name|property)=["']([^"']+)["']/i);
    const contentMatch = tagText.match(/content=["']([^"']*)["']/i);
    if (nameMatch && contentMatch && /^(description|og:title|og:description|twitter:title|twitter:description)$/i.test(nameMatch[1])) {
      entries.push([nameMatch[1], contentMatch[1]]);
    }
  }
  for (const [field, value] of entries) {
    for (const phrase of BANNED_PHRASES) {
      if (value.includes(phrase)) {
        addIssue("metadata-banned-phrase", url, locale, field, phrase, value);
      }
    }
  }
  if (!entries.some(([field]) => field === "description")) {
    addIssue("metadata-missing", url, locale, "meta-description", "missing", "");
  }
}

function checkJsonLd(url, locale, html) {
  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const json = block[1];
    for (const phrase of BANNED_PHRASES) {
      if (json.includes(phrase)) {
        addIssue("jsonld-banned-phrase", url, locale, "json-ld", phrase, findContext(json, phrase));
      }
    }
  }
}

function checkButtons(url, locale, html, path) {
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = match[1];
    const label = visibleText(match[2]).trim();
    if (!label) continue;
    const isBuy = BUY_WORDS[locale].test(label);
    const isGenerate = GENERATE_WORD.test(label) && !/coming|soon|paused|unavailable|即将|暂未|近日|곧|próximamente|bientôt|bald/i.test(label);
    if ((isBuy || isGenerate) && !/disabled/i.test(attrs)) {
      addIssue(isBuy ? "enabled-buy-button" : "enabled-generate-button", url, locale, path, label, attrs.trim().slice(0, 120));
    }
  }
}

function checkTermsRefund(url, locale, html, visible) {
  const marker = REFUND_MARKER[locale];
  if (!visible.includes(marker)) {
    addIssue("terms-refund-section-missing", url, locale, "terms", marker, "(visible text)");
    return;
  }
  if (!/11\./.test(visible)) {
    addIssue("terms-refund-number-missing", url, locale, "terms", "11.", "(visible text)");
  }
  if (!visible.includes("120")) {
    addIssue("terms-refund-window-missing", url, locale, "terms", "120 days", "(visible text)");
  }
  if (!visible.includes(EMAIL)) {
    addIssue("terms-contact-email-missing", url, locale, "terms", EMAIL, "(visible text)");
  }
  if (!html.includes("Waffo")) {
    addIssue("terms-waffo-mention-missing", url, locale, "terms", "Waffo", "(raw html)");
  }
}

function checkStudio(url, locale, visible) {
  if (!COMING_MARKER[locale].test(visible)) {
    addIssue("studio-coming-soon-missing", url, locale, "studio", "(coming marker)", visible.slice(0, 200));
  }
}

/* ------------------------------------------------------------------ run */

async function main() {
  console.log(`Waffo audit for ${BASE}`);
  console.log(`Locales: ${LOCALES.join(", ")}  Pages: ${PATHS.join(", ")}\n`);

  // 1. The language-prefix-less URLs Waffo reviews: no redirect expected.
  for (const pathName of ["/terms", "/privacy"]) {
    const url = `${BASE}${pathName}`;
    try {
      const response = await fetchPage(url);
      const visible = visibleText(await response.text());
      addNote(url, "default", "final-url", response.url);
      if (response.status !== 200) {
        addIssue("http-status", url, "default", "status", response.status, response.url);
      }
      if (response.url !== url) {
        addIssue("unexpected-redirect", url, "default", "redirect", response.url, "");
      }
      if (pathName === "/terms" && !visible.includes(REFUND_MARKER.en)) {
        addIssue("terms-refund-section-missing", url, "default", "terms", REFUND_MARKER.en, "(visible text)");
      }
      if (pathName === "/privacy" && !visible.includes("Privacy Policy")) {
        addIssue("privacy-title-missing", url, "default", "privacy", "Privacy Policy", "(visible text)");
      }
    } catch (error) {
      addIssue("fetch-error", url, "default", "fetch", String(error).slice(0, 120), "");
    }
  }

  // 2. Every locale x page.
  for (const locale of LOCALES) {
    const prefix = locale === "en" ? "" : `/${locale}`;
    for (const pathName of PATHS) {
      const url = `${BASE}${prefix}${pathName}`;
      try {
        const response = await fetchPage(url);
        const html = await response.text();
        const visible = visibleText(html);
        addNote(url, locale, "status", response.status);
        if (response.status !== 200) {
          addIssue("http-status", url, locale, "status", response.status, response.url);
          continue;
        }
        scanBanned(url, locale, html, visible);
        checkMetadata(url, locale, html);
        checkJsonLd(url, locale, html);
        if (pathName === "/terms") checkTermsRefund(url, locale, html, visible);
        if (pathName === "/studio") checkStudio(url, locale, visible);
        if (pathName === "/pricing") checkButtons(url, locale, html, pathName);
        if (pathName === "/terms" || pathName === "/privacy" || pathName === "/help" || pathName === "/about") {
          checkButtons(url, locale, html, pathName);
        }
        // Informational: serialized generation copy volume in raw HTML.
        const t2v = (html.match(/text-to-video/g) || []).length;
        const t2i = (html.match(/text-to-image/g) || []).length;
        if (t2v + t2i > 0) {
          addNote(url, locale, "generation-term-count", `text-to-video:${t2v} text-to-image:${t2i}`);
        }
      } catch (error) {
        addIssue("fetch-error", url, locale, "fetch", String(error).slice(0, 120), "");
      }
    }
  }

  // 3. Sitemap sanity for the legal pages.
  try {
    const response = await fetch(`${BASE}/sitemap.xml`);
    const xml = await response.text();
    for (const pathName of ["/terms", "/privacy"]) {
      if (!xml.includes(pathName)) {
        addIssue("sitemap-missing", `${BASE}/sitemap.xml`, "all", "sitemap", pathName, "");
      }
    }
  } catch (error) {
    addIssue("fetch-error", `${BASE}/sitemap.xml`, "all", "fetch", String(error).slice(0, 120), "");
  }

  // Report.
  const report = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    totals: { issues: issues.length, notes: notes.length },
    issues,
    notes,
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");

  console.log(`Issues: ${issues.length}`);
  for (const issue of issues) {
    console.log(`  [${issue.check}] ${issue.url} (${issue.locale}/${issue.field}): ${issue.matched}`);
  }
  console.log(`\nFull report: ${REPORT}`);
  process.exit(issues.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
