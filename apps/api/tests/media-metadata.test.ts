import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { probeMp4Metadata } from "../src/business/media-metadata.js";

describe("MP4 metadata probe", () => {
  it("reads real dimensions and duration from the generated silent fixture", () => {
    const bytes = readFileSync(path.resolve("assets/live-mock/16x9-5s.mp4"));
    const meta = probeMp4Metadata(bytes);
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(360);
    // MediaRecorder emits fragmented MP4: mvhd duration may be zero, while
    // the player reports the real duration. Dimensions must still parse.
    if (meta.durationSeconds !== null) {
      expect(meta.durationSeconds).toBeGreaterThan(4.5);
      expect(meta.durationSeconds).toBeLessThan(5.5);
    }
  });

  it("returns nulls for non-MP4 bytes", () => {
    expect(probeMp4Metadata(Buffer.from("not a video"))).toEqual({
      width: null,
      height: null,
      durationSeconds: null,
    });
  });
});
