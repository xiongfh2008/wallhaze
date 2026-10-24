import { describe, expect, it } from "vitest";
import {
  formatAspectRatio,
  nativeDeviceFor,
  nativeDevicesFor,
  recommendVideoRatio,
  sortMediaForPreferredDevice,
} from "@/lib/media";
import { detectDeviceProfile } from "@/lib/studio/device";
import { PRESET_WALLPAPERS, getWallpaperBySlug } from "@/lib/wallpapers";

function profile(
  screenWidth: number,
  screenHeight: number,
  innerWidth: number,
  innerHeight: number,
  maxTouchPoints: number
) {
  const result = detectDeviceProfile({
    screenWidth,
    screenHeight,
    innerWidth,
    innerHeight,
    pixelRatio: 3,
    maxTouchPoints,
  });
  if (!result) throw new Error("expected a detectable profile");
  return result;
}

const phone = profile(390, 844, 390, 844, 5);
const exactPhone = profile(390, 693, 390, 693, 5);
const phoneLandscape = profile(844, 390, 844, 390, 5);
const tabletPortrait = profile(820, 1180, 820, 1180, 5);
const tabletLandscape = profile(1180, 820, 1180, 820, 5);
const squareTablet = profile(1024, 1024, 1024, 1024, 5);
const desktop = profile(1440, 900, 1440, 900, 0);

describe("actual media dimensions", () => {
  it("formats only ratios the file actually has", () => {
    expect(formatAspectRatio(768, 1368)).toBe("9:16");
    expect(formatAspectRatio(1368, 768)).toBe("16:9");
    expect(formatAspectRatio(480, 480)).toBe("1:1");
    expect(formatAspectRatio(900, 1200)).toBe("3:4");
    expect(formatAspectRatio(1000, 1100)).toBe("1:1.10");
    expect(formatAspectRatio(0, 1200)).toBe("—");
  });

  it("classifies native devices from the real ratio, never from a label", () => {
    expect(nativeDeviceFor(1080, 1920)).toBe("phone");
    expect(nativeDeviceFor(768, 1368)).toBe("phone");
    expect(nativeDeviceFor(1024, 1368)).toBe("tablet");
    expect(nativeDeviceFor(1024, 1024)).toBe("tablet");
    expect(nativeDeviceFor(1920, 1080)).toBe("desktop");
    expect(nativeDevicesFor(Number.NaN, 1080)).toEqual([]);
  });

  it("keeps every preset's declared metadata consistent with its pixels", () => {
    expect(PRESET_WALLPAPERS).toHaveLength(57);
    for (const wallpaper of PRESET_WALLPAPERS) {
      expect(wallpaper.width, wallpaper.id).toBeGreaterThan(0);
      expect(wallpaper.height, wallpaper.id).toBeGreaterThan(0);
      expect(wallpaper.mediaType).toBe("image");
      expect(wallpaper.aspectRatio).toBeCloseTo(
        wallpaper.width / wallpaper.height,
        10
      );
      expect(wallpaper.nativeDevices).toEqual(
        nativeDevicesFor(wallpaper.width, wallpaper.height)
      );
    }
    const landscape = getWallpaperBySlug("nebula-city");
    expect(landscape?.width).toBeGreaterThan(landscape?.height ?? 0);
    expect(landscape?.nativeDevices).toEqual(["desktop"]);
    const portrait = getWallpaperBySlug("sakura-nights");
    expect(portrait?.height).toBeGreaterThan(portrait?.width ?? 0);
    expect(portrait?.nativeDevices).toEqual(["phone"]);
    const tablet = PRESET_WALLPAPERS.filter((w) =>
      w.nativeDevices.includes("tablet")
    );
    const desktop = PRESET_WALLPAPERS.filter((w) =>
      w.nativeDevices.includes("desktop")
    );
    expect(tablet.length).toBeGreaterThanOrEqual(9);
    expect(desktop.length).toBeGreaterThanOrEqual(9);
  });
});

describe("preferred-device ordering", () => {
  const items = [
    { id: "desktop", width: 1920, height: 1080 },
    { id: "phone", width: 1080, height: 1920 },
    { id: "tablet", width: 1024, height: 1024 },
  ];

  it("puts matching native media first without hiding the rest", () => {
    const sorted = sortMediaForPreferredDevice(items, "phone");
    expect(sorted.map((item) => item.id)).toEqual([
      "phone",
      "desktop",
      "tablet",
    ]);
    expect(sorted).toHaveLength(items.length);
    expect(items.map((item) => item.id)).toEqual([
      "desktop",
      "phone",
      "tablet",
    ]);
  });

  it("preserves the source order when no device is preferred", () => {
    expect(
      sortMediaForPreferredDevice(items, null).map((item) => item.id)
    ).toEqual(["desktop", "phone", "tablet"]);
  });
});

describe("video ratio recommendation (provider-limited)", () => {
  const allVideoRatios = ["16:9", "9:16", "1:1"] as const;

  it("uses screen orientation for every device class", () => {
    expect(recommendVideoRatio(phone, allVideoRatios).ratio).toBe("9:16");
    expect(recommendVideoRatio(phoneLandscape, allVideoRatios).ratio).toBe(
      "16:9"
    );
    expect(recommendVideoRatio(tabletPortrait, allVideoRatios).ratio).toBe(
      "9:16"
    );
    expect(recommendVideoRatio(tabletLandscape, allVideoRatios).ratio).toBe(
      "16:9"
    );
    expect(recommendVideoRatio(squareTablet, allVideoRatios).ratio).toBe("1:1");
    expect(recommendVideoRatio(desktop, allVideoRatios).ratio).toBe("16:9");
  });

  it("never returns a ratio the provider did not expose", () => {
    for (const supported of [
      ["9:16"],
      ["16:9"],
      ["1:1"],
      ["9:16", "1:1"],
      ["16:9", "1:1"],
    ] as const) {
      for (const deviceProfile of [phone, tabletPortrait, desktop]) {
        const recommendation = recommendVideoRatio(deviceProfile, supported);
        expect(supported).toContain(recommendation.ratio);
        expect(["phone", "tablet", "desktop"]).toContain(
          recommendation.device
        );
      }
    }
  });

  it("reports an approximate match honestly", () => {
    expect(recommendVideoRatio(exactPhone, ["9:16"]).exactMatch).toBe(true);
    expect(recommendVideoRatio(phone, ["9:16"]).exactMatch).toBe(false);
    expect(recommendVideoRatio(squareTablet, ["16:9"]).exactMatch).toBe(false);
  });
});
