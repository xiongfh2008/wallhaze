import { describe, expect, it } from "vitest";
import {
  autoSelectSize,
  detectDeviceProfile,
  recommendWallpaperSize,
  type ScreenInfo,
} from "@/lib/studio/device";

const phone: ScreenInfo = {
  screenWidth: 390,
  screenHeight: 844,
  innerWidth: 390,
  innerHeight: 760,
  pixelRatio: 3,
  maxTouchPoints: 5,
};
const tablet: ScreenInfo = {
  screenWidth: 820,
  screenHeight: 1180,
  innerWidth: 820,
  innerHeight: 1100,
  pixelRatio: 2,
  maxTouchPoints: 5,
};
const desktop: ScreenInfo = {
  screenWidth: 1440,
  screenHeight: 900,
  innerWidth: 1440,
  innerHeight: 820,
  pixelRatio: 1,
  maxTouchPoints: 0,
};

describe("device detection", () => {
  it("detects phone, tablet and desktop without brand heuristics", () => {
    expect(detectDeviceProfile(phone)?.device).toBe("phone");
    expect(detectDeviceProfile(tablet)?.device).toBe("tablet");
    expect(detectDeviceProfile(desktop)?.device).toBe("desktop");
  });

  it("treats a narrow desktop window as desktop (no touch)", () => {
    const narrow = { ...desktop, innerWidth: 600, innerHeight: 700 };
    expect(detectDeviceProfile(narrow)?.device).toBe("desktop");
  });

  it("treats a wide touch device as desktop (touch laptop)", () => {
    const laptop = { ...desktop, maxTouchPoints: 10 };
    expect(detectDeviceProfile(laptop)?.device).toBe("desktop");
  });

  it("estimates physical pixels from CSS size and DPR", () => {
    expect(detectDeviceProfile(phone)?.physical).toEqual({ width: 1170, height: 2532 });
    expect(detectDeviceProfile(phone)?.orientation).toBe("portrait");
  });

  it("handles landscape orientation and square screens", () => {
    const landscape = { ...phone, screenWidth: 844, screenHeight: 390, innerWidth: 844, innerHeight: 390 };
    expect(detectDeviceProfile(landscape)?.orientation).toBe("landscape");
    const square = { ...desktop, screenWidth: 1080, screenHeight: 1080 };
    expect(detectDeviceProfile(square)?.orientation).toBe("square");
  });

  it("returns null for unusable screen facts", () => {
    expect(detectDeviceProfile({ ...phone, screenWidth: 0 })).toBeNull();
    expect(detectDeviceProfile({ ...phone, innerWidth: Number.NaN })).toBeNull();
  });
});

describe("size recommendation", () => {
  it("recommends a 9:16 phone preset", () => {
    const result = autoSelectSize(phone)!;
    expect(result.device).toBe("phone");
    expect(result.ratio).toBe("9:16");
    expect(result.preset).toMatchObject({ width: 1080, height: 1920 });
    // A 390×844 phone is 19.5:9 — 9:16 is the closest supported shape.
    expect(result.exactMatch).toBe(false);
  });

  it("recommends a 3:4 tablet preset", () => {
    const result = autoSelectSize(tablet)!;
    expect(result.device).toBe("tablet");
    expect(result.ratio).toBe("3:4");
    expect(result.preset.ratio).toBe("3:4");
  });

  it("recommends a 16:9 desktop preset", () => {
    const result = autoSelectSize(desktop)!;
    expect(result.device).toBe("desktop");
    expect(result.ratio).toBe("16:9");
    expect(result.preset).toMatchObject({ width: 1920, height: 1080 });
  });

  it("flags modern tall phones as approximate", () => {
    // 19.5:9 phone: 9:16 is the closest supported ratio but not exact.
    const result = autoSelectSize({ ...phone, screenWidth: 393, screenHeight: 852 })!;
    expect(result.ratio).toBe("9:16");
    expect(result.exactMatch).toBe(false);
  });

  it("always returns a preset the device supports", () => {
    for (const info of [phone, tablet, desktop]) {
      const profile = detectDeviceProfile(info)!;
      const rec = recommendWallpaperSize(profile);
      expect(rec.preset.device).toBe(profile.device);
      expect(rec.preset.ratio).toBe(rec.ratio);
    }
  });
});
