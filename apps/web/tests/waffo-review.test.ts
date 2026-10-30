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
      for (const model of ["FLUX.2 [Klein] 4B", "Wan 2.2 5B", "Kling V3 Standard"]) {
        expect(fal).toContain(model);
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

describe("studio model disclosure", () => {
  it("shows the real models and links to pricing", () => {
    for (const locale of LOCALES) {
      expect(msgValue(locale, "studio.modelNameImage")).toBe("FLUX.2 [Klein] 4B");
      expect(msgValue(locale, "studio.modelNameI2v")).toBe("Wan 2.2 5B");
      expect(msgValue(locale, "studio.modelNameT2v")).toBe("Kling V3 Standard");
      const note = String(msgValue(locale, "studio.modelsNote"));
      expect(note.toLowerCase()).toMatch(/acceptable use|可接受使用|利用ポリシー|이용 정책|uso aceptable|utilisation acceptable|akzeptablen nutzung/);
      expect(String(msgValue(locale, "studio.viewPricing")).length).toBeGreaterThan(0);
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
