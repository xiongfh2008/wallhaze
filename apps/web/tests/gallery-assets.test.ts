import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRESET_WALLPAPERS, isDownloadAllowed } from "@/lib/wallpapers";
import { findStyle } from "@/lib/styles";

const NEW_WALLPAPERS = [
  "sakura-dream",
  "galaxy-tide",
  "stillwater-dawn",
  "abyssal-bloom",
  "aurora-veil",
  "quiet-geometry",
  "dewline",
  "poppy-field",
  "soft-horizon",
  "nebula-drift",
  "stillwater-night",
  "hong-kong-rain",
  "forest-rays",
  "quiet-bridge",
  "jellyfish-deep",
  "sunset-platform",
  "aurora-veil-wide",
  "light-ribbons-wide",
] as const;

describe("new tablet/desktop gallery content", () => {
  it("ships every declared local asset with real dimensions", () => {
    for (const id of NEW_WALLPAPERS) {
      const wallpaper = PRESET_WALLPAPERS.find((item) => item.id === id);
      expect(wallpaper, id).toBeDefined();
      expect(wallpaper!.image).toMatch(/^\/images\//);
      const image = wallpaper!.image;
      if (!image) throw new Error(`${id} has no public image`);
      expect(
        existsSync(path.join(process.cwd(), "public", image.replace(/^\//, ""))),
        image
      ).toBe(true);
      expect(wallpaper!.width).toBeGreaterThan(0);
      expect(wallpaper!.height).toBeGreaterThan(0);
      expect(wallpaper!.aspectRatio).toBeCloseTo(
        wallpaper!.width / wallpaper!.height,
        10
      );
    }
  });

  it("keeps licensed additions traceable and procedural additions honest", () => {
    for (const id of NEW_WALLPAPERS) {
      const wallpaper = PRESET_WALLPAPERS.find((item) => item.id === id)!;
      if (wallpaper.license === "verified") {
        expect(wallpaper.source, id).toBeTruthy();
        expect(wallpaper.source?.pageUrl).toMatch(/^https:/);
        expect(wallpaper.source?.license).toBe("CC0");
      } else {
        expect(wallpaper.license, id).toBe("self-authored");
        expect(wallpaper.source, id).toBeUndefined();
      }
    }
  });

  it("adds both tablet and desktop native formats", () => {
    const newItems = PRESET_WALLPAPERS.filter((item) =>
      (NEW_WALLPAPERS as readonly string[]).includes(item.id)
    );
    expect(newItems.filter((item) => item.nativeDevices.includes("tablet"))).toHaveLength(9);
    expect(newItems.filter((item) => item.nativeDevices.includes("desktop"))).toHaveLength(9);
  });

  it("never offers a download for review-pending artwork", () => {
    expect(PRESET_WALLPAPERS.filter((item) => item.license === "review-pending")).toHaveLength(39);
    for (const item of PRESET_WALLPAPERS) {
      expect(isDownloadAllowed(item.license), item.id).toBe(item.license !== "review-pending");
    }
  });

  it("uses real style ids for every added wallpaper", () => {
    for (const id of NEW_WALLPAPERS) {
      const wallpaper = PRESET_WALLPAPERS.find((item) => item.id === id)!;
      expect(findStyle(wallpaper.styleId), `${id}:${wallpaper.styleId}`).toBeTruthy();
    }
  });
});
