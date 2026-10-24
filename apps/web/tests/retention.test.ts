import { describe, expect, it } from "vitest";
import { formatExpiryDate, retentionDisplay } from "@/lib/retention";

const NOW = Date.parse("2026-10-24T12:00:00.000Z");

describe("cloud retention display", () => {
  it("rounds remaining days up and marks the 7/1-day thresholds", () => {
    expect(retentionDisplay("2026-11-11T12:00:00.000Z", NOW)).toEqual({
      days: 18,
      tone: "normal",
      expired: false,
    });
    expect(retentionDisplay("2026-10-31T12:00:00.000Z", NOW)).toEqual({
      days: 7,
      tone: "soon",
      expired: false,
    });
    expect(retentionDisplay("2026-10-25T12:00:00.000Z", NOW)).toEqual({
      days: 1,
      tone: "urgent",
      expired: false,
    });
    expect(retentionDisplay("2026-10-24T11:59:59.000Z", NOW)).toEqual({
      days: 0,
      tone: "expired",
      expired: true,
    });
  });

  it("returns null for legacy records without a server expiry", () => {
    expect(retentionDisplay(null, NOW)).toBeNull();
    expect(retentionDisplay(undefined, NOW)).toBeNull();
    expect(retentionDisplay("not-a-date", NOW)).toBeNull();
  });

  it("formats the server date without inventing a new deadline", () => {
    expect(formatExpiryDate("2026-11-23T12:00:00.000Z", "en")).toContain(
      "2026"
    );
    expect(formatExpiryDate("2026-11-23T12:00:00.000Z", "zh")).toContain(
      "2026"
    );
  });
});
