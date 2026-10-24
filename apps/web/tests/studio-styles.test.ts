import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  STYLE_DESCRIPTIONS,
  STYLE_GROUPS,
  WALLPAPER_STYLES,
  findStyle,
} from "@/lib/styles";

const NEW_STYLE_IDS = [
  "paper-cut",
  "clay-3d",
  "low-poly",
  "stained-glass",
  "vaporwave",
  "botanical-illustration",
] as const;

const MAINSTREAM_STYLE_IDS = [
  "starry-galaxy",
  "mountain-lake",
  "deep-ocean",
  "aurora-nights",
  "architecture-minimal",
  "macro-nature",
  "soft-gradient",
  "abstract-light",
] as const;

const locales = ["en", "zh", "ja", "ko", "es", "fr", "de"];

function messages(locale: string): {
  styleLabels: Record<string, string>;
  styleDescriptions: Record<string, string>;
} {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "messages", `${locale}.json`),
      "utf8"
    )
  );
}

describe("style library", () => {
  it("has unique ids and keeps the original styles", () => {
    const ids = WALLPAPER_STYLES.map((style) => style.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("anime");
    expect(ids).toContain("cozy-anime");
    expect(WALLPAPER_STYLES.length).toBeGreaterThanOrEqual(43);
  });

  it("adds the eight missing mainstream styles with real previews", () => {
    for (const id of MAINSTREAM_STYLE_IDS) {
      const style = findStyle(id);
      expect(style, id).toBeTruthy();
      expect(style?.image).toBeTruthy();
      expect(style?.promptTemplate.length ?? 0).toBeGreaterThan(40);
      expect(STYLE_DESCRIPTIONS[id]).toBeTruthy();
      const imagePath = path.join(process.cwd(), "public", style!.image!.replace(/^\//, ""));
      expect(fs.existsSync(imagePath), imagePath).toBe(true);
    }
  });

  it("adds the six differentiated styles with prompt templates", () => {
    for (const id of NEW_STYLE_IDS) {
      const style = findStyle(id);
      expect(style, id).toBeTruthy();
      expect(style?.promptTemplate.length ?? 0).toBeGreaterThan(20);
      expect(style?.category).toBeTruthy();
      expect(STYLE_DESCRIPTIONS[id]).toBeTruthy();
    }
  });

  it("assigns every style to a known category and description", () => {
    const groupIds = new Set(STYLE_GROUPS.map((group) => group.id));
    for (const style of WALLPAPER_STYLES) {
      expect(groupIds.has(style.category ?? "abstract"), style.id).toBe(true);
      expect(STYLE_DESCRIPTIONS[style.id], style.id).toBeTruthy();
      expect(style.promptTemplate.trim().length, style.id).toBeGreaterThan(0);
    }
  });

  it("provides localized inspiration examples in all seven languages", () => {
    for (const locale of locales) {
      const dict = messages(locale) as unknown as { generator: Record<string, string> };
      for (const n of [1, 2, 3, 4]) {
        expect(dict.generator[`inspiration${n}`], `${locale}:inspiration${n}`).toBeTruthy();
      }
    }
    const zh = messages("zh") as unknown as { generator: Record<string, string> };
    expect(/[一-鿿]/.test(zh.generator.inspiration1)).toBe(true);
  });

  it("has a display name in all seven languages for every style", () => {
    for (const locale of locales) {
      const dict = messages(locale);
      for (const style of WALLPAPER_STYLES) {
        expect(dict.styleLabels[style.id], `${locale}:${style.id}`).toBeTruthy();
        expect(
          dict.styleDescriptions[style.id],
          `${locale}:desc:${style.id}`
        ).toBeTruthy();
      }
    }
  });
});
