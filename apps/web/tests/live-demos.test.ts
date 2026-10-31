import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARCHIVED_LIVE_DEMOS, LIVE_DEMOS } from "@/lib/live-demos";
import { nativeDeviceFor } from "@/lib/media";
import { findStyle } from "@/lib/styles";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicFile = (url: string) =>
  path.join(webRoot, "public", url.replace(/^\//, ""));

describe("original AI live-wallpaper demos", () => {
  it("ships six real, looping MP4 demos with posters", () => {
    expect(LIVE_DEMOS).toHaveLength(6);
    expect(new Set(LIVE_DEMOS.map((demo) => demo.id)).size).toBe(6);
    for (const demo of LIVE_DEMOS) {
      expect(demo.kind).toBe("demo");
      expect(demo.license).toBe("self-authored");
      expect(demo.source.aiGenerated).toBe(true);
      expect(demo.durationSeconds).toBeGreaterThanOrEqual(3);
      expect(demo.durationSeconds).toBeLessThanOrEqual(5);
      expect(demo.width).toBeGreaterThan(0);
      expect(demo.height).toBeGreaterThan(0);

      const video = publicFile(demo.video);
      const poster = publicFile(demo.poster);
      expect(existsSync(video), demo.video).toBe(true);
      expect(existsSync(poster), demo.poster).toBe(true);
      expect(statSync(video).size).toBeGreaterThan(100_000);
      expect(statSync(poster).size).toBeGreaterThan(500);

      const bytes = readFileSync(video);
      const header = bytes.subarray(0, 12);
      expect(header.subarray(4, 8).toString("ascii")).toBe("ftyp");
      // Demos are silent: the MP4 must not advertise an audio track.
      expect(bytes.includes(Buffer.from("mp4a"))).toBe(false);
      const posterHeader = readFileSync(poster).subarray(0, 3);
      expect([...posterHeader]).toEqual([0xff, 0xd8, 0xff]);
    }
  });

  it("labels each demo's native device from its actual pixels", () => {
    for (const demo of LIVE_DEMOS) {
      expect(demo.devices).toContain(
        nativeDeviceFor(demo.width, demo.height)
      );
    }
    // Every current demo is a desktop-format (landscape) original.
    expect(new Set(LIVE_DEMOS.flatMap((demo) => demo.devices))).toEqual(
      new Set(["desktop"])
    );
  });

  it("uses real catalogue styles", () => {
    for (const demo of LIVE_DEMOS) {
      expect(findStyle(demo.styleId), demo.id).toBeDefined();
    }
  });

  it("keeps the retired CC0 photo demos archived with their provenance", () => {
    expect(ARCHIVED_LIVE_DEMOS.length).toBeGreaterThanOrEqual(8);
    for (const demo of ARCHIVED_LIVE_DEMOS) {
      expect(demo.license).toBe("cc0");
      expect(demo.source.aiGenerated).toBe(false);
      // The retired files remain in the media library.
      expect(existsSync(publicFile(demo.video)), demo.video).toBe(true);
      expect(existsSync(publicFile(demo.poster)), demo.poster).toBe(true);
    }
  });
});
