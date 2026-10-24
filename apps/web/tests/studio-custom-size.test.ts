import { describe, expect, it } from "vitest";
import {
  parseCustomSize,
  ratioLabel,
  swapSizeText,
} from "@/lib/studio/custom-size";
import { buildGenerationRequest } from "@/lib/studio/request";

describe("custom size input", () => {
  it("accepts legal sizes and simplifies the ratio", () => {
    expect(parseCustomSize("1080", "1920")).toEqual({
      ok: true,
      width: 1080,
      height: 1920,
      ratioLabel: "9:16",
    });
    expect(ratioLabel(2048, 2048)).toBe("1:1");
  });

  it("rejects empty, non-numeric, decimal and negative input", () => {
    expect(parseCustomSize("", "1920")).toMatchObject({ ok: false, error: "required" });
    expect(parseCustomSize("1080", "abc")).toMatchObject({ ok: false, error: "invalid" });
    expect(parseCustomSize("1080.5", "1920")).toMatchObject({ ok: false, error: "invalid" });
    expect(parseCustomSize("-1080", "1920")).toMatchObject({ ok: false, error: "invalid" });
  });

  it("enforces bounds, step alignment and area", () => {
    expect(parseCustomSize("400", "1920")).toMatchObject({ ok: false, error: "range" });
    expect(parseCustomSize("4096", "4096")).toMatchObject({ ok: false, error: "range" });
    expect(parseCustomSize("1080", "1921")).toMatchObject({ ok: false, error: "step" });
    expect(parseCustomSize("2048", "2048")).toMatchObject({ ok: true });
  });

  it("swaps width and height", () => {
    expect(swapSizeText("1080", "1920")).toEqual({ widthText: "1920", heightText: "1080" });
  });
});

describe("generation request builder", () => {
  const base = {
    prompt: "  a calm sea  ",
    styleId: "minimalist",
    device: "phone" as const,
    ratio: "9:16" as const,
    presetId: "phone-1080x1920",
    customSize: null,
    refImageUrl: null,
  };

  it("sends the selected style, trimmed prompt and preset", () => {
    expect(buildGenerationRequest(base)).toEqual({
      prompt: "a calm sea",
      styleId: "minimalist",
      device: "phone",
      aspectRatio: "9:16",
      sizePresetId: "phone-1080x1920",
    });
  });

  it("omits preset/ratio for custom sizes and keeps the reference image", () => {
    const request = buildGenerationRequest({
      ...base,
      customSize: { width: 1080, height: 1920 },
      refImageUrl: "data:image/png;base64,abc",
    });
    expect(request).toEqual({
      prompt: "a calm sea",
      styleId: "minimalist",
      device: "phone",
      width: 1080,
      height: 1920,
      refImage: "data:image/png;base64,abc",
    });
    expect(request).not.toHaveProperty("sizePresetId");
    expect(request).not.toHaveProperty("aspectRatio");
  });

  it("omits an empty prompt and null style", () => {
    const request = buildGenerationRequest({
      ...base,
      prompt: "   ",
      styleId: null,
      presetId: null,
    });
    expect(request).toEqual({
      device: "phone",
      aspectRatio: "9:16",
      sizePresetId: null,
    });
  });
});
