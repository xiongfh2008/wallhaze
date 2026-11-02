import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";

/**
 * Waffo review remediation checks (public-surface integrity):
 *  - the official contact email replaced the old personal Gmail everywhere
 *    public (legal pages, community, themes, pages/components source);
 *  - the Terms carry the six prohibited content categories plus the AUP link;
 *  - the Privacy policy discloses the real data flow (fal.ai models, Waffo
 *    screening) and the screening section;
 *  - the /pricing page content matches the real server-side configuration;
 *  - the Studio discloses the real models;
 *  - both new public pages are in the sitemap.
 */

const webRoot = process.cwd();
const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"] as const;
const OLD_EMAIL = "xiongfh2000@gmail.com";
const EMAIL = "hello@wallhaze.com";

function messages(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(webRoot, "messages", `${locale}.json`), "utf8")
  );
}

function msgValue(locale: string, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[part]
          : undefined,
      messages(locale)
    );
}

/** The six Waffo categories, by an unambiguous marker per locale item. */
const CATEGORY_MARKERS = [
  { key: "nsfw", markers: ["NSFW", "非自愿私密", "親密な映像", "친밀 영상", "íntimas sin consentimiento", "intimes sans consentiment", "intime Bilder ohne Einwilligung"] },
  { key: "violence", markers: ["gore", "血腥", "流血", "유혈", "gore", "gore", "Gore"] },
  { key: "hate", markers: ["hate speech", "仇恨言论", "ヘイトスピーチ", "혐오 발언", "discurso de odio", "propos haineux", "Hassrede"] },
  { key: "csam", markers: ["sexualizes minors", "性化未成年人", "性的に描写", "성적으로 묘사", "sexualice a menores", "sexualisant des mineurs", "Minderjährige sexualisieren"] },
  { key: "deepfake", markers: ["deepfake", "深度伪造", "ディープフェイク", "딥페이크", "deepfake", "deepfake", "Deepfake"] },
  { key: "ip", markers: ["infringes copyright", "侵犯著作权", "知的財産権を侵害", "지식재산권을 침해", "infrinja derechos de autor", "droits d’auteur, marques", "geistiges Eigentum verletzen"] },
];

describe("official contact email", () => {
  it("no longer appears in any message file", () => {
    for (const locale of LOCALES) {
      expect(JSON.stringify(messages(locale))).not.toContain(OLD_EMAIL);
    }
  });

  it("no longer appears in pages, components, lib or data sources", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|json|md|mjs)$/.test(entry.name)) {
          if (readFileSync(full, "utf8").includes(OLD_EMAIL)) hits.push(full);
        }
      }
    };
    for (const dir of ["app", "components", "lib", "data", "messages"]) {
      walk(path.join(webRoot, dir));
    }
    expect(hits).toEqual([]);
  });

  it("legal pages and community submission use hello@wallhaze.com", () => {
    for (const locale of LOCALES) {
      const privacy = msgValue(locale, "privacy.contactBody");
      const terms = msgValue(locale, "terms.contactBody");
      expect(String(privacy)).toContain(EMAIL);
      expect(String(terms)).toContain(EMAIL);
    }
    const community = readFileSync(
      path.join(webRoot, "lib", "community.ts"),
      "utf8"
    );
    expect(community).toContain(`"${EMAIL}"`);
  });
});

describe("contact page: official customer support channel", () => {
  const CONTRADICTORY_PHRASES = [
    "No official channel published yet",
    "No support email or ticket system has been confirmed",
    "Official contact channels will be published here once they are available",
    "官方渠道确认后将在此公布",
    "公式窓口は確認後にここで公開されます",
    "공식 채널은 확인 후 여기에 공개됩니다",
    "se publicarán aquí cuando estén disponibles",
    "seront publiés ici dès qu",
    "werden hier veröffentlicht, sobald sie verfügbar sind",
  ];

  it("contact namespace states the official support email in every locale", () => {
    for (const locale of LOCALES) {
      expect(String(msgValue(locale, "contact.supportTitle")).length).toBeGreaterThan(0);
      expect(String(msgValue(locale, "contact.supportEmailLabel")).length).toBeGreaterThan(0);
      // The namespace as a whole names the official email (feedback body does;
      // the rendered page also shows it as the mailto link text).
      expect(JSON.stringify(msgValue(locale, "contact"))).toContain(EMAIL);
      expect(msgValue(locale, "contact.unavailableTitle")).toBeUndefined();
      expect(msgValue(locale, "contact.unavailableBody")).toBeUndefined();
    }
  });

  it("no contradictory contact copy remains in any message file or metadata", () => {
    for (const locale of LOCALES) {
      const raw = JSON.stringify(messages(locale));
      for (const phrase of CONTRADICTORY_PHRASES) {
        expect(raw).not.toContain(phrase);
      }
      // The metadata description names the official support email.
      expect(String(msgValue(locale, "meta.contactDescription"))).toContain(EMAIL);
    }
  });

  it("the contact page renders a clickable mailto link to the official email", () => {
    const source = readFileSync(
      path.join(webRoot, "app", "[locale]", "contact", "page.tsx"),
      "utf8"
    );
    expect(source).toContain('SUPPORT_EMAIL = "hello@wallhaze.com"');
    expect(source).toContain("mailto:");
  });
});

describe("terms: six prohibited content categories", () => {
  it("prohibitedItems contains all six Waffo categories in every locale", () => {
    for (const locale of LOCALES) {
      const items = msgValue(locale, "terms.prohibitedItems") as string[];
      expect(Array.isArray(items)).toBe(true);
      for (const category of CATEGORY_MARKERS) {
        const matched = items.some((item) =>
          category.markers.some((marker) => item.includes(marker))
        );
        expect(matched).toBe(true);
      }
      // The original six items remain (14 total: 6 original + 8 additions).
      expect(items.length).toBe(14);
    }
  });

  it("links to the Acceptable Use Policy", () => {
    for (const locale of LOCALES) {
      expect(String(msgValue(locale, "terms.prohibitedAupBody")).length).toBeGreaterThan(0);
      expect(String(msgValue(locale, "terms.prohibitedAupLink")).length).toBeGreaterThan(0);
    }
  });

  it("carries the revision date", () => {
    for (const locale of LOCALES) {
      expect(String(msgValue(locale, "terms.updated"))).toContain("2026");
      expect(String(msgValue(locale, "privacy.updated"))).toContain("2026");
    }
  });
});

describe("privacy: real data flow disclosure", () => {
  it("discloses the fal.ai models and the screening provider", () => {
    for (const locale of LOCALES) {
      const items = msgValue(locale, "privacy.thirdPartyItems") as string[];
      const fal = items.find((item) => item.includes("fal.ai"));
      expect(fal).toBeTruthy();
      // Processor disclosure stays; model names stay out.
      for (const model of ["FLUX", "Klein", "Wan 2.2", "Kling"]) {
        expect(fal).not.toContain(model);
      }
      const screening = items.find((item) => item.includes("Waffo"));
      expect(screening).toBeTruthy();
      expect(String(msgValue(locale, "privacy.screeningTitle")).length).toBeGreaterThan(0);
      if (locale === "en") {
        expect(String(msgValue(locale, "privacy.screeningBody"))).toContain("job");
      }
    }
  });
});

describe("pricing page content matches the real configuration", () => {
  it("packages mirror credit_packages: 100/$5, 500/$20, 2000/$69 one-time", () => {
    for (const locale of LOCALES) {
      const packages = msgValue(locale, "pricing.packages") as Array<{
        name: string;
        credits: string;
        price: string;
      }>;
      // German formats 2000 as "2.000"; every other locale as "2,000".
      const expectedCredits = locale === "de" ? ["100", "500", "2.000"] : ["100", "500", "2,000"];
      expect(packages.map((p) => p.credits)).toEqual(expectedCredits);
      expect(packages.map((p) => p.price)).toEqual(["$5", "$20", "$69"]);
      expect(String(msgValue(locale, "pricing.packagesIntro"))).toMatch(
        /one-time|一次性|一括|일회성|únicas|uniques|einmalige/i
      );
    }
  });

  it("generation costs mirror pricing.ts and video-pricing.ts", () => {
    const costs = msgValue("en", "pricing.genItems") as Array<{
      name: string;
      cost: string;
    }>;
    expect(costs.some((c) => c.cost === "10 Credits")).toBe(true);
    expect(costs.some((c) => c.cost === "40 Credits")).toBe(true);
    expect(costs.some((c) => c.cost === "40 / 50 / 60 Credits")).toBe(true);
  });

  it("keeps the honest checkout state and no-subscription billing", () => {
    for (const locale of LOCALES) {
      expect(String(msgValue(locale, "pricing.checkoutComing")).length).toBeGreaterThan(0);
      expect(String(msgValue(locale, "pricing.checkoutBody")).length).toBeGreaterThan(0);
      const billing = msgValue(locale, "pricing.billingItems") as string[];
      expect(billing.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("pricing and aup pages are metadata-covered in every locale", () => {
    for (const locale of LOCALES) {
      expect(String(msgValue(locale, "meta.pricingTitle")).length).toBeGreaterThan(0);
      expect(String(msgValue(locale, "meta.aupTitle")).length).toBeGreaterThan(0);
    }
  });
});

describe("acceptable use policy page content", () => {
  it("defines the six prohibited categories with screening and appeals", () => {
    for (const locale of LOCALES) {
      const categories = msgValue(locale, "aup.categories") as Array<{
        name: string;
        body: string;
      }>;
      expect(categories).toHaveLength(6);
      for (const category of categories) {
        expect(category.name.length).toBeGreaterThan(0);
        expect(category.body.length).toBeGreaterThan(0);
      }
      expect(String(msgValue(locale, "aup.reportBody"))).toContain(EMAIL);
      const items = msgValue(locale, "aup.additionalItems") as string[];
      expect(items.length).toBe(4);
    }
  });
});

describe("model disclosure is scoped to About + Terms (Waffo requirement)", () => {
  const MODEL_MARKERS = ["FLUX", "Klein", "Wan 2.2", "Kling V3"];
  const ALLOWED_PREFIXES = ["about.aiModel", "terms.aiModels", "privacy.thirdParty"];

  it("model names appear only in the allowed disclosure namespaces", () => {
    for (const locale of LOCALES) {
      const scan = (value: unknown, path: string): void => {
        if (typeof value === "string") {
          for (const marker of MODEL_MARKERS) {
            if (value.includes(marker)) {
              expect(
                ALLOWED_PREFIXES.some((prefix) => path.includes(prefix)),
                `model name in ${path}`
              ).toBe(true);
            }
          }
          return;
        }
        if (value && typeof value === "object") {
          for (const [key, item] of Object.entries(value)) {
            scan(item, `${path}.${key}`);
          }
        }
      };
      scan(messages(locale), locale);
    }
  });

  it("model names do NOT appear on homepage, studio, pricing, or navigation", () => {
    for (const locale of LOCALES) {
      const raw = JSON.stringify(messages(locale));
      // Strip the allowed namespaces before scanning.
      const j = JSON.parse(raw);
      const filtered = JSON.stringify({
        meta: j.meta,
        nav: j.nav,
        hero: j.hero,
        studioIntro: j.studioIntro,
        howItWorks: j.howItWorks,
        cta: j.cta,
        pricing: j.pricing,
        generator: j.generator,
        footer: j.footer,
        studio: { ...j.studio },
      });
      for (const marker of MODEL_MARKERS) {
        expect(filtered).not.toContain(marker);
      }
    }
  });

  it("the Studio shows a simple AI-powered section and keeps the pricing link", () => {
    for (const locale of LOCALES) {
      expect(String(msgValue(locale, "studio.aiGenerationTitle")).length).toBeGreaterThan(0);
      expect(String(msgValue(locale, "studio.aiGenerationBody")).length).toBeGreaterThan(0);
      expect(String(msgValue(locale, "studio.viewPricing")).length).toBeGreaterThan(0);
      expect(msgValue(locale, "studio.modelsTitle")).toBeUndefined();
    }
  });

  it("the Studio video note no longer surfaces a provider id", () => {
    for (const locale of LOCALES) {
      const walk = (value: unknown, path: string): void => {
        if (typeof value === "string") {
          if (path.endsWith("providerNote")) {
            expect(value.toLowerCase()).not.toContain("provider");
          }
          return;
        }
        if (value && typeof value === "object") {
          for (const [key, item] of Object.entries(value)) {
            walk(item, `${path}.${key}`);
          }
        }
      };
      walk(messages(locale), locale);
    }
  });
});

describe("public page discoverability", () => {
  it("includes /pricing and /acceptable-use with hreflang alternates", () => {
    const entries = sitemap();
    for (const pathName of ["/pricing", "/acceptable-use"]) {
      const entry = entries.find((e) => e.url.endsWith(pathName));
      expect(entry).toBeTruthy();
      expect(entry!.alternates?.languages).toBeTruthy();
    }
  });
});

/**
 * Third Waffo rejection remediation (2026-11-01):
 *  1. Terms must carry a full Refund and Cancellation Policy aligned with
 *     the Waffo Buyer Terms (merchant of record, 120-day refund window,
 *     14-business-day processing) — never "all digital sales are final".
 *  2. No public copy may describe AI Studio generation (text-to-image,
 *     reference-image editing, image-to-video, text-to-video) as an
 *     available service; it is planned and not currently available.
 *  3. Section numbering in Terms must match the rendered order.
 */
describe("terms: refund and cancellation policy", () => {
  it("exists as section 11 with Waffo-aligned rules in every locale", () => {
    for (const locale of LOCALES) {
      const title = String(msgValue(locale, "terms.refundTitle"));
      expect(title).toMatch(/^11\./);
      const items = msgValue(locale, "terms.refundItems") as string[];
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(8);
      const joined = items.join(" ");
      // Waffo is the merchant of record; requests via Buyer Portal or email.
      expect(joined).toContain("Waffo");
      expect(joined).toContain(EMAIL);
      // Refund window (120 days) and processing time (14 business days)
      // match the current Waffo Buyer Terms.
      expect(joined).toContain("120");
      expect(joined).toMatch(/14/);
      // Statutory consumer rights are not limited.
      expect(joined).not.toMatch(/no refund|non-refundable|final sale/i);
    }
  });

  it("terms section numbering matches the rendered order", () => {
    const source = readFileSync(
      path.join(webRoot, "app", "[locale]", "terms", "page.tsx"),
      "utf8"
    );
    const ids = [...source.matchAll(/\{ id: "([a-zA-Z]+)", hasList/g)].map(
      (match) => match[1]
    );
    expect(ids.length).toBeGreaterThanOrEqual(16);
    for (const locale of LOCALES) {
      let previous = 0;
      for (const id of ids) {
        const title = String(msgValue(locale, `terms.${id}Title`));
        const number = Number.parseInt(title, 10);
        expect(Number.isInteger(number)).toBe(true);
        expect(number).toBe(previous + 1);
        previous = number;
      }
    }
  });
});

describe("AI Studio is described as planned, not available", () => {
  /** Exact legacy phrases that claimed generation was a live service. */
  const BANNED_PHRASES = [
    "Create stunning AI wallpapers",
    "Create with AI",
    "Create Wallpaper",
    "Create for This Theme",
    "creating an account or generating images",
    "when you use the AI Studio, we store",
    "the AI Studio, Credits and orders",
    "fal.ai) — when you request a generation",
    "Waffo Prompt Sift reviews prompts",
    "The Studio lets you create your own wallpaper",
    "and make it yours",
    "Your generation history is stored only in this browser",
    "使用 AI 创作主题壁纸",
    "このテーマで AI 制作",
    "이 테마로 AI 제작",
    "Für dieses Thema erstellen",
    "Créer pour ce thème",
    "Crear para este tema",
  ];

  it("no legacy present-tense generation copy remains in any locale", () => {
    for (const locale of LOCALES) {
      const raw = JSON.stringify(messages(locale));
      for (const phrase of BANNED_PHRASES) {
        expect(raw).not.toContain(phrase);
      }
    }
  });

  /** A coming-soon / not-available marker per locale (semantic guard). */
  const COMING_MARKERS: Record<(typeof LOCALES)[number], RegExp> = {
    en: /coming soon|not currently available|planned/i,
    zh: /即将|暂未|尚未|暂不|规划中/,
    ja: /近日|計画中|現在利用でき|まだ/,
    ko: /곧 공개|계획 중|현재 이용|아직/,
    es: /próximamente|pronto|planificad|no está disponible/i,
    fr: /bientôt|prévu|pas disponible/i,
    de: /bald|geplant|nicht verfügbar/i,
  };

  /** A purchasing-not-yet-available marker per locale. */
  const NOT_YET_MARKERS: Record<(typeof LOCALES)[number], RegExp> = {
    en: /not yet available|not currently available/i,
    zh: /尚未开放|暂未开放|尚未|暂不/,
    ja: /まだ利用できま|まだ利用できない|購入はまだ/,
    ko: /아직 불가능|아직 제공되지|구매는 아직/,
    es: /aún no está disponible|no está disponible/i,
    fr: /pas encore disponible|pas disponible/i,
    de: /noch nicht verfügbar|nicht verfügbar/i,
  };

  it("home, about, help and creations metadata carry a coming-soon marker", () => {
    for (const locale of LOCALES) {
      for (const key of [
        "meta.homeDescription",
        "meta.aboutDescription",
        "meta.helpDescription",
        "meta.myCreationsDescription",
      ]) {
        const value = String(msgValue(locale, key));
        expect(
          COMING_MARKERS[locale as keyof typeof COMING_MARKERS].test(value)
        ).toBe(true);
      }
    }
  });

  it("credits and pricing metadata state purchasing is not yet available", () => {
    for (const locale of LOCALES) {
      for (const key of [
        "meta.creditsDescription",
        "meta.pricingDescription",
      ]) {
        const value = String(msgValue(locale, key));
        expect(
          NOT_YET_MARKERS[locale as keyof typeof NOT_YET_MARKERS].test(value)
        ).toBe(true);
      }
    }
  });

  it("hero and header CTAs no longer promise creation", () => {
    for (const locale of LOCALES) {
      const cta = String(msgValue(locale, "hero.ctaCreate"));
      const button = String(msgValue(locale, "nav.getStarted"));
      for (const value of [cta, button]) {
        expect(value).not.toMatch(/create|生成|创作|作成|만들|crear|créer|erstellen/i);
        expect(COMING_MARKERS[locale as keyof typeof COMING_MARKERS].test(value) || /studio|プレビュー|미리|ver|découvrir|ansehen/i.test(value)).toBe(true);
      }
    }
  });
});

describe("client message payload stays minimal and intact", () => {
  it("no server-only namespace is requested by a client component", () => {
    const libSource = readFileSync(
      path.join(webRoot, "lib", "client-messages.ts"),
      "utf8"
    );
    const serverOnly = [...libSource.matchAll(/"([a-zA-Z]+)",?\n/g)].map(
      (match) => match[1]
    );
    expect(serverOnly.length).toBeGreaterThanOrEqual(8);

    const clientUses: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx$/.test(entry.name)) {
          const source = readFileSync(full, "utf8");
          for (const match of source.matchAll(
            /useTranslations\(\s*"([a-zA-Z]+)"/g
          )) {
            clientUses.push(match[1]);
          }
        }
      }
    };
    walk(path.join(webRoot, "components"));
    for (const namespace of clientUses) {
      expect(
        serverOnly,
        `namespace ${namespace} used by a client component but stripped from the provider`
      ).not.toContain(namespace);
    }
  });

  it("liveStudio namespace stays present in every locale (SSR/hydration)", () => {
    for (const locale of LOCALES) {
      const live = msgValue(locale, "liveStudio");
      expect(live).toBeTruthy();
      expect(typeof live).toBe("object");
      expect(Object.keys(live as object).length).toBeGreaterThan(0);
    }
  });
});
