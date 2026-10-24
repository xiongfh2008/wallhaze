/**
 * Persisted manual size preference (jsdom).
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearSizePreference,
  readSizePreference,
  saveSizePreference,
} from "@/lib/studio/device";

afterEach(() => {
  window.localStorage.clear();
});

describe("manual size preference", () => {
  it("round-trips a preset choice", () => {
    saveSizePreference({
      device: "tablet",
      ratio: "3:4",
      presetId: "tablet-1020x1360",
      custom: null,
    });
    expect(readSizePreference()).toEqual({
      device: "tablet",
      ratio: "3:4",
      presetId: "tablet-1020x1360",
      custom: null,
    });
  });

  it("round-trips a custom size", () => {
    saveSizePreference({
      device: "desktop",
      ratio: "16:9",
      presetId: null,
      custom: { width: 1920, height: 1080 },
    });
    expect(readSizePreference()?.custom).toEqual({ width: 1920, height: 1080 });
  });

  it("rejects corrupted or inconsistent saved data", () => {
    window.localStorage.setItem(
      "wallhaze:studio:size:v1",
      JSON.stringify({ device: "phone", ratio: "bogus", presetId: null })
    );
    expect(readSizePreference()).toBeNull();

    window.localStorage.setItem(
      "wallhaze:studio:size:v1",
      JSON.stringify({
        device: "phone",
        ratio: "9:16",
        presetId: "desktop-1920x1080",
      })
    );
    expect(readSizePreference()).toBeNull();

    window.localStorage.setItem("wallhaze:studio:size:v1", "{not json");
    expect(readSizePreference()).toBeNull();
  });

  it("clears the preference for Auto mode", () => {
    saveSizePreference({
      device: "phone",
      ratio: "9:16",
      presetId: "phone-1080x1920",
      custom: null,
    });
    clearSizePreference();
    expect(readSizePreference()).toBeNull();
  });
});
