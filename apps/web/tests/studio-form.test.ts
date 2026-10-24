import { describe, expect, it } from "vitest";
import { PROMPT_MAX_LENGTH } from "@wallhaze/contracts";
import {
  STUDIO_PROMPT_MAX_LENGTH,
  applyDeviceChange,
  applyRatioChange,
  isFormSelectionValid,
  isValidRatioId,
  listPresetsForSelection,
  resolveStylePreselect,
  validatePromptPair,
} from "@/lib/studio/form";
import {
  ASPECT_RATIOS,
  DEVICE_ALLOWED_RATIOS,
  DEVICE_PRESET_RATIO,
  getDefaultSizePreset,
  type HistoryDevice,
} from "@/lib/sizes";

const DEVICES: readonly HistoryDevice[] = ["phone", "tablet", "desktop"];

/** A legal starting selection per device (its default ratio + preset). */
function selectionFor(device: HistoryDevice) {
  const preset = getDefaultSizePreset(device);
  return {
    device,
    ratio: DEVICE_PRESET_RATIO[device],
    presetId: preset && preset.ratio === DEVICE_PRESET_RATIO[device] ? preset.id : null,
  };
}

describe("form selection validity", () => {
  it("accepts every legal device+ratio pair, with or without a preset", () => {
    for (const device of DEVICES) {
      for (const ratio of DEVICE_ALLOWED_RATIOS[device]) {
        expect(isFormSelectionValid({ device, ratio, presetId: null })).toBe(true);
        for (const preset of listPresetsForSelection({ device, ratio, presetId: null })) {
          expect(isFormSelectionValid({ device, ratio, presetId: preset.id })).toBe(true);
        }
      }
    }
  });

  it("rejects ratios the device does not allow", () => {
    expect(isFormSelectionValid({ device: "phone", ratio: "16:9", presetId: null })).toBe(false);
    expect(isFormSelectionValid({ device: "desktop", ratio: "9:16", presetId: null })).toBe(false);
    expect(isFormSelectionValid({ device: "phone", ratio: "4:3", presetId: null })).toBe(false);
  });

  it("rejects presets that do not belong to the device+ratio pair", () => {
    // Wrong device.
    expect(
      isFormSelectionValid({ device: "tablet", ratio: "9:16", presetId: "phone-1080x1920" })
    ).toBe(false);
    // Wrong ratio for the device.
    expect(
      isFormSelectionValid({ device: "phone", ratio: "3:4", presetId: "phone-1080x1920" })
    ).toBe(false);
    // Unknown preset id.
    expect(
      isFormSelectionValid({ device: "phone", ratio: "9:16", presetId: "made-up-preset" })
    ).toBe(false);
  });
});

describe("applyDeviceChange", () => {
  it("keeps the ratio when the new device still allows it", () => {
    const next = applyDeviceChange(
      { device: "phone", ratio: "9:16", presetId: "phone-1080x1920" },
      "tablet"
    );
    expect(next).toEqual({ device: "tablet", ratio: "9:16", presetId: "tablet-1080x1920" });
  });

  it("falls back to the new device's preset ratio when the ratio is illegal", () => {
    const next = applyDeviceChange(
      { device: "phone", ratio: "9:16", presetId: "phone-1080x1920" },
      "desktop"
    );
    expect(next.ratio).toBe("16:9");
    expect(next.presetId).toBe("desktop-1920x1080");
    expect(isFormSelectionValid(next)).toBe(true);
  });

  it("never keeps the previous device's preset", () => {
    const next = applyDeviceChange(
      { device: "phone", ratio: "3:4", presetId: "phone-1020x1360" },
      "tablet"
    );
    expect(next.presetId).not.toBe("phone-1020x1360");
    expect(isFormSelectionValid(next)).toBe(true);
  });

  it("leaves every device change self-consistent", () => {
    for (const from of DEVICES) {
      const start = selectionFor(from);
      for (const to of DEVICES) {
        const next = applyDeviceChange(start, to);
        expect(next.device).toBe(to);
        expect(isFormSelectionValid(next)).toBe(true);
      }
    }
  });
});

describe("applyRatioChange", () => {
  it("re-resolves the preset when the ratio changes within the device", () => {
    const next = applyRatioChange(
      { device: "phone", ratio: "9:16", presetId: "phone-1080x1920" },
      "3:4"
    );
    expect(next).toEqual({ device: "phone", ratio: "3:4", presetId: "phone-1020x1360" });

    const desktop = applyRatioChange(
      { device: "desktop", ratio: "16:9", presetId: "desktop-1920x1080" },
      "4:3"
    );
    expect(desktop).toEqual({
      device: "desktop",
      ratio: "4:3",
      presetId: "desktop-1600x1200",
    });
  });

  it("ignores ratios the device does not allow", () => {
    const next = applyRatioChange(
      { device: "phone", ratio: "9:16", presetId: "phone-1080x1920" },
      "16:9"
    );
    expect(next).toEqual({
      device: "phone",
      ratio: "9:16",
      presetId: "phone-1080x1920",
    });
  });

  it("keeps a still-valid preset untouched", () => {
    const next = applyRatioChange(
      { device: "phone", ratio: "9:16", presetId: "phone-1080x1920" },
      "9:16"
    );
    expect(next.presetId).toBe("phone-1080x1920");
  });

  it("leaves every ratio change self-consistent across all devices", () => {
    for (const device of DEVICES) {
      const start = selectionFor(device);
      for (const ratio of ASPECT_RATIOS) {
        const next = applyRatioChange(start, ratio.id);
        expect(isFormSelectionValid(next)).toBe(true);
      }
    }
  });
});

describe("listPresetsForSelection", () => {
  it("lists only the presets of the device+ratio pair", () => {
    expect(
      listPresetsForSelection({ device: "phone", ratio: "9:16", presetId: null }).map((p) => p.id)
    ).toEqual(["phone-1080x1920"]);
    expect(
      listPresetsForSelection({ device: "desktop", ratio: "4:3", presetId: null }).map((p) => p.id)
    ).toEqual(["desktop-1600x1200", "desktop-1440x1080"]);
    expect(
      listPresetsForSelection({ device: "phone", ratio: "16:9", presetId: null })
    ).toEqual([]);
  });
});

describe("validatePromptPair", () => {
  it("uses the contract limit of 800 characters", () => {
    expect(STUDIO_PROMPT_MAX_LENGTH).toBe(800);
    expect(STUDIO_PROMPT_MAX_LENGTH).toBe(PROMPT_MAX_LENGTH);
  });

  it("accepts a prompt at exactly the limit and rejects one above", () => {
    expect(validatePromptPair("a".repeat(800), null)).toEqual({ ok: true });
    expect(validatePromptPair("a".repeat(801), null)).toEqual({
      ok: false,
      code: "too-long",
      limit: 800,
    });
  });

  it("rejects an empty prompt without a style", () => {
    expect(validatePromptPair("", null)).toEqual({ ok: false, code: "empty", limit: 800 });
    expect(validatePromptPair("   \n\t ", null)).toEqual({
      ok: false,
      code: "empty",
      limit: 800,
    });
  });

  it("allows an empty prompt when a style supplies the template", () => {
    expect(validatePromptPair("", "anime")).toEqual({ ok: true });
    expect(validatePromptPair("   ", "cyberpunk")).toEqual({ ok: true });
  });

  it("allows a normal prompt with or without a style", () => {
    expect(validatePromptPair("neon skyline at night", null)).toEqual({ ok: true });
    expect(validatePromptPair("neon skyline at night", "surreal")).toEqual({ ok: true });
  });
});

describe("resolveStylePreselect", () => {
  it("resolves a known style id", () => {
    expect(resolveStylePreselect("anime")).toBe("anime");
    expect(resolveStylePreselect("cyberpunk")).toBe("cyberpunk");
  });

  it("degrades unknown, empty and missing values to null", () => {
    expect(resolveStylePreselect("not-a-style")).toBeNull();
    expect(resolveStylePreselect("")).toBeNull();
    expect(resolveStylePreselect(null)).toBeNull();
    expect(resolveStylePreselect(undefined)).toBeNull();
  });

  it("is case-sensitive rather than guessing", () => {
    expect(resolveStylePreselect("ANIME")).toBeNull();
    expect(resolveStylePreselect("Anime")).toBeNull();
  });
});

describe("isValidRatioId", () => {
  it("accepts the five supported ratios only", () => {
    for (const ratio of ASPECT_RATIOS) {
      expect(isValidRatioId(ratio.id)).toBe(true);
    }
    expect(isValidRatioId("21:9")).toBe(false);
    expect(isValidRatioId(null)).toBe(false);
    expect(isValidRatioId(1)).toBe(false);
  });
});
