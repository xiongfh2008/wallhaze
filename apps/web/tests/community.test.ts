import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMUNITY_EMAIL,
  COMMUNITY_SUBMISSION_BODY,
  COMMUNITY_SUBMISSION_SUBJECT,
  COMMUNITY_WORKS,
  getCommunityWorkBySlug,
  getSubmissionWorks,
  isPubliclyPublished,
  normalizeCommunityWork,
  reportMailto,
  submissionMailto,
  type CommunityWork,
} from "@/lib/community";
import { getDemoWorks, isCommunityDemoMode } from "@/lib/community/demo";
import { nativeDeviceFor } from "@/lib/media";
import { findStyle } from "@/lib/styles";

const webRoot = process.cwd();
const worksJson = JSON.parse(
  readFileSync(path.join(webRoot, "data", "community", "works.json"), "utf8")
) as { works: Array<{ status: string; [key: string]: unknown }> };
const authorsJson = JSON.parse(
  readFileSync(path.join(webRoot, "data", "community", "authors.json"), "utf8")
) as { authors: Array<Record<string, unknown>> };
const locales = ["en", "zh", "ja", "ko", "es", "fr", "de"] as const;

function messageValue(locale: string, key: string): unknown {
  const messages = JSON.parse(
    readFileSync(path.join(webRoot, "messages", `${locale}.json`), "utf8")
  );
  return key.split(".").reduce<unknown>((value, part) => {
    if (value && typeof value === "object") {
      return (value as Record<string, unknown>)[part];
    }
    return undefined;
  }, messages);
}

function allKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => [key, ...allKeys(child)]
  );
}

describe("community content model", () => {
  it("keeps real submissions empty and demo works strictly separated", () => {
    expect(COMMUNITY_WORKS).toEqual([]);
    expect(getSubmissionWorks()).toEqual([]);
    // In the test environment the demo flag is off; getDemoWorks() is the
    // raw data loader, but the Community page only renders it behind
    // isCommunityDemoMode() AND a non-production NODE_ENV.
    expect(isCommunityDemoMode()).toBe(false);
    const demoWorks = getDemoWorks();
    expect(demoWorks.length).toBeGreaterThan(0);
    const realSlugs = new Set(COMMUNITY_WORKS.map((work) => work.slug));
    for (const work of demoWorks) {
      expect(realSlugs.has(work.slug), work.slug).toBe(false);
      expect(work.origin).toBe("demo_seed");
      expect(work.author.isDemo).toBe(true);
    }
    expect(isPubliclyPublished).toBeTypeOf("function");
  });

  it("keeps only explicitly published, displayable works public", () => {
    expect(COMMUNITY_WORKS.every(isPubliclyPublished)).toBe(true);
    const draft = {
      ...COMMUNITY_WORKS[0],
      status: "reviewed" as const,
    } satisfies CommunityWork;
    const withdrawn = {
      ...COMMUNITY_WORKS[0],
      status: "withdrawn" as const,
      allowPublicDisplay: false,
    } satisfies CommunityWork;
    expect(isPubliclyPublished(draft)).toBe(false);
    expect(isPubliclyPublished(withdrawn)).toBe(false);
    expect(getCommunityWorkBySlug("does-not-exist")).toBeUndefined();
  });

  it("uses real dimensions, styles and native device classes", () => {
    for (const work of COMMUNITY_WORKS) {
      expect(findStyle(work.styleId), work.id).toBeTruthy();
      expect(nativeDeviceFor(work.width, work.height), work.id).toBe(
        work.deviceType
      );
      expect(work.aspectRatio, work.id).toBeCloseTo(
        work.width / work.height,
        10
      );
      if (work.mediaType === "video") {
        expect(work.durationSeconds, work.id).toBeGreaterThan(0);
        expect(work.posterAsset, work.id).toBeTruthy();
      } else {
        expect(work.durationSeconds, work.id).toBeNull();
        expect(work.posterAsset, work.id).toBeNull();
      }
    }
  });

  it("keeps every published asset present and local", () => {
    for (const work of COMMUNITY_WORKS) {
      const assets = [
        work.previewAsset,
        work.posterAsset,
        work.downloadAsset,
      ].filter((value): value is string => Boolean(value));
      for (const asset of assets) {
        expect(asset.startsWith("/"), `${work.id}: ${asset}`).toBe(true);
        expect(asset.startsWith("/private"), `${work.id}: ${asset}`).toBe(false);
        expect(
          existsSync(path.join(webRoot, "public", asset.replace(/^\//, ""))),
          `${work.id}: ${asset}`
        ).toBe(true);
      }
    }
  });

  it("keeps demo works out of theme picks and real stats", () => {
    for (const work of getDemoWorks()) {
      expect(
        COMMUNITY_WORKS.some((real) => real.id === work.id)
      ).toBe(false);
    }
  });

  it("exposes a download asset only when permission is explicit", () => {
    for (const work of COMMUNITY_WORKS) {
      if (work.allowDownload) {
        expect(work.downloadAsset, work.id).toBeTruthy();
        expect(["all-rights-reserved", "custom"], work.id).not.toContain(
          work.downloadLicense
        );
        expect(work.downloadScope, work.id).toBeTruthy();
      } else {
        expect(work.downloadAsset, work.id).toBeNull();
      }
    }
  });

  it("does not leak private submission fields into public data", () => {
    const publicText = JSON.stringify(worksJson) + JSON.stringify(authorsJson);
    const forbidden = ["contactEmail", "email", "evidence", "privatePath", "reviewer"];
    for (const key of forbidden) {
      expect(publicText, key).not.toContain(`"${key}"`);
    }
    for (const key of allKeys(worksJson)) {
      expect(key).not.toMatch(/email|private|evidence/i);
    }
    expect(worksJson.works.every((work) => work.status === "published")).toBe(
      true
    );
  });

  it("resolves every real-work title/description key in all seven locales", () => {
    for (const work of COMMUNITY_WORKS) {
      for (const key of [work.titleKey, work.descriptionKey, work.sourceDescriptionKey]) {
        if (!key) continue;
        for (const locale of locales) {
          expect(messageValue(locale, key), `${locale}.${key}`).toBeTypeOf(
            "string"
          );
        }
      }
    }
  });

  it("builds a real mailto submission with the required template", () => {
    const mailto = submissionMailto();
    expect(mailto.startsWith(`mailto:${COMMUNITY_EMAIL}?`)).toBe(true);
    expect(mailto).toContain(encodeURIComponent(COMMUNITY_SUBMISSION_SUBJECT));
    expect(mailto).toContain(encodeURIComponent("作品名称："));
    expect(COMMUNITY_SUBMISSION_BODY).toContain("是否允许公开下载：是 / 否");
    expect(COMMUNITY_SUBMISSION_BODY).toContain(
      "请将壁纸文件作为邮件附件，或提供安全的文件下载链接。"
    );
  });

  it("builds a report mailto with the work link and no fake success state", () => {
    const mailto = reportMailto(
      "Demo Sample Work",
      "https://wallhaze.com/community/demo-001"
    );
    expect(mailto.startsWith(`mailto:${COMMUNITY_EMAIL}?`)).toBe(true);
    expect(mailto).toContain(encodeURIComponent("Demo Sample Work"));
    expect(mailto).toContain(
      encodeURIComponent("https://wallhaze.com/community/demo-001")
    );
  });

  it("has no community upload API or file-input form", () => {
    expect(
      existsSync(path.join(webRoot, "app", "api", "community"))
    ).toBe(false);
    const panel = readFileSync(
      path.join(webRoot, "components", "community", "SubmissionPanel.tsx"),
      "utf8"
    );
    expect(panel).not.toMatch(/<form\b/);
    expect(panel).not.toMatch(/type=["']file["']/);
  });

  it("rejects an unknown theme association instead of linking a broken theme", () => {
    const demo = getDemoWorks()[0];
    expect(demo, "demo seed fixture is required for this test").toBeTruthy();
    expect(() =>
      normalizeCommunityWork({
        ...demo,
        themeId: "missing-theme",
      })
    ).toThrow(/themeId/);
  });

  it("rejects an inconsistent device class instead of rendering a false label", () => {
    const demo = getDemoWorks()[0];
    expect(demo, "demo seed fixture is required for this test").toBeTruthy();
    const raw = {
      ...demo,
      deviceType:
        demo.deviceType === "phone" ? ("desktop" as const) : ("phone" as const),
    };
    expect(() => normalizeCommunityWork(raw)).toThrow(/deviceType/);
  });
});
