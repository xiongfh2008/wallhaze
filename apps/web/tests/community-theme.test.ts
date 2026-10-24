import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMUNITY_THEMES,
  formatThemeDate,
  getActiveTheme,
  getEndedThemes,
  resolveThemeStatus,
  themeCoverIsPublic,
  themeStudioHref,
  themeSubmissionMailto,
  validRecommendedStyles,
  type CommunityTheme,
} from "@/lib/community/themes";
import { getThemeFeaturedWorks } from "@/lib/community";

const webRoot = process.cwd();
const activeTheme = COMMUNITY_THEMES.find((theme) => theme.id === "dreamy-nightscapes")!;
const inside = new Date("2026-10-24T12:00:00+08:00");
const before = new Date("2026-09-01T00:00:00+08:00");
const after = new Date("2026-12-01T00:00:00+08:00");

function clone(overrides: Partial<CommunityTheme>): CommunityTheme {
  return { ...activeTheme, ...overrides };
}

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

describe("Monthly Wallpaper Challenge configuration", () => {
  it("has at most one active theme at the controlled current time", () => {
    expect(getActiveTheme(COMMUNITY_THEMES, inside)?.id).toBe(
      "dreamy-nightscapes"
    );
    expect(
      COMMUNITY_THEMES.filter(
        (theme) => resolveThemeStatus(theme, inside) === "active"
      )
    ).toHaveLength(1);
  });

  it("does not expose future, draft, disabled or malformed themes as active", () => {
    expect(resolveThemeStatus(activeTheme, before)).toBe("scheduled");
    expect(resolveThemeStatus(activeTheme, after)).toBe("ended");
    expect(resolveThemeStatus(clone({ status: "draft" }), inside)).toBe(
      "hidden"
    );
    expect(resolveThemeStatus(clone({ status: "disabled" }), inside)).toBe(
      "hidden"
    );
    expect(
      resolveThemeStatus(clone({ startsAt: "not-a-date" }), inside)
    ).toBe("hidden");
    expect(resolveThemeStatus(clone({ status: "ended" }), inside)).toBe(
      "ended"
    );
  });

  it("stops accepting after the configured deadline and hides unchanged history", () => {
    expect(getActiveTheme(COMMUNITY_THEMES, after)).toBeNull();
    expect(getEndedThemes(COMMUNITY_THEMES, after)).toHaveLength(1);
    expect(getThemeFeaturedWorks(activeTheme)).toEqual([]);
    expect(getActiveTheme([], inside)).toBeNull();
  });

  it("uses a real public cover and safe recommended styles", () => {
    expect(themeCoverIsPublic(activeTheme)).toBe(true);
    expect(validRecommendedStyles(activeTheme).length).toBeGreaterThan(0);
    expect(
      validRecommendedStyles(
        clone({ recommendedStyleIds: ["not-a-style" as never] })
      )
    ).toEqual([]);
  });

  it("formats theme dates in its configured timezone", () => {
    expect(
      formatThemeDate(activeTheme.startsAt, "en", activeTheme.timezone)
    ).toMatch(/2026/);
  });

  it("encodes the theme submission subject and full body", () => {
    const mailto = themeSubmissionMailto(activeTheme, "Dreamy Nightscapes");
    expect(mailto.startsWith("mailto:xiongfh2000@gmail.com?")).toBe(true);
    expect(mailto).toContain(
      encodeURIComponent("[WallHaze Monthly Theme] Dreamy Nightscapes")
    );
    expect(mailto).toContain(encodeURIComponent("主题名称："));
    expect(mailto).toContain(encodeURIComponent("授予 WallHaze 的展示及下载许可范围："));
    expect(mailto).toContain(
      encodeURIComponent("请附上作品文件或安全的下载链接。")
    );
  });

  it("builds a Studio link with a valid style, prompt and optional device", () => {
    const href = themeStudioHref(
      activeTheme,
      "dreamy night prompt",
      "desktop"
    );
    expect(href.startsWith("/studio?")).toBe(true);
    expect(href).toContain("prompt=dreamy+night+prompt");
    expect(href).toContain("style=cinematic");
    expect(href).toContain("device=desktop");

    const invalid = themeStudioHref(
      clone({ recommendedStyleIds: ["not-a-style" as never] }),
      "fallback prompt",
      null
    );
    expect(invalid).toContain("prompt=fallback+prompt");
    expect(invalid).not.toContain("style=");
    expect(invalid).not.toContain("device=");
  });

  it("resolves theme content keys in all seven locales", () => {
    for (const locale of ["en", "zh", "ja", "ko", "es", "fr", "de"]) {
      for (const key of [
        activeTheme.titleKey,
        activeTheme.descriptionKey,
        activeTheme.inspirationKey,
        activeTheme.coverAltKey,
      ]) {
        expect(messageValue(locale, key), `${locale}.${key}`).toBeTypeOf(
          "string"
        );
      }
      for (const key of [
        "community.monthly.eyebrow",
        "community.monthly.activeBadge",
        "community.monthly.submitCta",
        "community.monthly.studioCta",
        "community.monthly.pastTitle",
      ]) {
        expect(messageValue(locale, key), `${locale}.${key}`).toBeTypeOf(
          "string"
        );
      }
    }
  });
});
