/**
 * RL suite — unit tests for lib/server/rate-limit.ts (T03-B1 matrix
 * RL-01..RL-12). Pure functions with injected `now` timestamps — NO real
 * waiting for 60-second windows or UTC day rollovers (T03-B2 §七).
 *
 * Constants under test (source of truth, baseline a5fcb90):
 *   SHORT_WINDOW_MS=60_000, SHORT_WINDOW_LIMIT=10,
 *   DAILY_LIMIT_PER_KEY=30, GLOBAL_DAILY_LIMIT=200,
 *   CONCURRENCY_LIMIT=3, STALE_SLOT_MS=150_000.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  checkDailyQuota,
  checkGlobalDailyBudget,
  checkShortWindow,
  releaseConcurrencySlot,
  resetRateLimitStateForTests,
  tryAcquireConcurrencySlot,
} from "@/lib/server/rate-limit";

/** 2026-01-01T10:00:00.000Z — 14h before the next UTC midnight. */
const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);

beforeEach(() => {
  resetRateLimitStateForTests();
});

describe("Short-window limiter — 10 per 60s (RL-01..RL-04)", () => {
  it("RL-01: the 1st..10th calls within the window are allowed, the 11th is rejected with a retry hint inside the window", () => {
    for (let i = 1; i <= 10; i += 1) {
      expect(checkShortWindow("k", T0).allowed).toBe(true);
    }
    const rejected = checkShortWindow("k", T0);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("RL-02: after the 60s window rolls over, the same key is allowed again (fixed window restart)", () => {
    for (let i = 0; i < 10; i += 1) checkShortWindow("k", T0);
    expect(checkShortWindow("k", T0).allowed).toBe(false);
    // Exactly SHORT_WINDOW_MS later: new window, fresh count.
    expect(checkShortWindow("k", T0 + 60_000).allowed).toBe(true);
  });

  it("RL-03: exhausting one key never affects a different key", () => {
    for (let i = 0; i < 10; i += 1) checkShortWindow("key-a", T0);
    expect(checkShortWindow("key-a", T0).allowed).toBe(false);
    expect(checkShortWindow("key-b", T0).allowed).toBe(true);
  });

  it("RL-04: retryAfterSeconds is the exact remaining window time (ceil semantics)", () => {
    for (let i = 0; i < 10; i += 1) checkShortWindow("k", T0);
    // 12345ms into the window → remaining = (60000-12345)/1000 → ceil = 48s.
    const rejected = checkShortWindow("k", T0 + 12_345);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBe(48);
  });
});

describe("Per-key daily quota — 30 per UTC day (RL-05..RL-06)", () => {
  it("RL-05: the 1st..30th submissions are allowed, the 31st is rejected with seconds-until-UTC-midnight (tested directly, NOT through the short window)", () => {
    for (let i = 1; i <= 30; i += 1) {
      expect(checkDailyQuota("k", T0).allowed).toBe(true);
    }
    const rejected = checkDailyQuota("k", T0);
    expect(rejected.allowed).toBe(false);
    // 10:00:00Z → next UTC midnight is 14h away → exactly 50400s.
    expect(rejected.retryAfterSeconds).toBe(50_400);
  });

  it("RL-06: the quota resets when the UTC day rolls over, with a fresh exact retry hint", () => {
    for (let i = 0; i < 30; i += 1) checkDailyQuota("k", T0);
    expect(checkDailyQuota("k", T0).allowed).toBe(false);

    const nextDay = T0 + 86_400_000; // 2026-01-02T10:00:00Z — new day key
    expect(checkDailyQuota("k", nextDay).allowed).toBe(true);
    for (let i = 0; i < 29; i += 1) {
      expect(checkDailyQuota("k", nextDay).allowed).toBe(true);
    }
    const rejected = checkDailyQuota("k", nextDay);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBe(50_400);
  });
});

describe("Global daily budget — 200 per UTC day (RL-07..RL-08)", () => {
  it("RL-07: the 1st..200th submissions are allowed, the 201st is rejected (global counter, key-independent)", () => {
    for (let i = 1; i <= 200; i += 1) {
      expect(checkGlobalDailyBudget(T0).allowed).toBe(true);
    }
    const rejected = checkGlobalDailyBudget(T0);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBe(50_400);
  });

  it("RL-08: the global budget resets on the UTC day rollover", () => {
    for (let i = 0; i < 200; i += 1) checkGlobalDailyBudget(T0);
    expect(checkGlobalDailyBudget(T0).allowed).toBe(false);
    expect(checkGlobalDailyBudget(T0 + 86_400_000).allowed).toBe(true);
  });
});

describe("Concurrency slots — limit 3 (RL-09..RL-10)", () => {
  it("RL-09: three slots can be acquired, the fourth is refused, and releasing one reopens a slot", () => {
    expect(tryAcquireConcurrencySlot(T0)).toBe(true);
    expect(tryAcquireConcurrencySlot(T0)).toBe(true);
    expect(tryAcquireConcurrencySlot(T0)).toBe(true);
    expect(tryAcquireConcurrencySlot(T0)).toBe(false);

    releaseConcurrencySlot();
    expect(tryAcquireConcurrencySlot(T0)).toBe(true);
  });

  it("RL-10: slots older than STALE_SLOT_MS (150s) are reclaimed on the next acquire attempt", () => {
    expect(tryAcquireConcurrencySlot(T0)).toBe(true);
    expect(tryAcquireConcurrencySlot(T0)).toBe(true);
    expect(tryAcquireConcurrencySlot(T0)).toBe(true);
    expect(tryAcquireConcurrencySlot(T0)).toBe(false);

    // A release was "missed" — after 150s + 1ms the stuck slot self-heals.
    expect(tryAcquireConcurrencySlot(T0 + 150_001)).toBe(true);
  });
});

describe("Test state reset (RL-11..RL-12)", () => {
  it("RL-11: resetRateLimitStateForTests restores short-window, daily, global and concurrency state to a pristine baseline", () => {
    for (let i = 0; i < 10; i += 1) checkShortWindow("k", T0);
    for (let i = 0; i < 30; i += 1) checkDailyQuota("k", T0);
    for (let i = 0; i < 200; i += 1) checkGlobalDailyBudget(T0);
    tryAcquireConcurrencySlot(T0);
    tryAcquireConcurrencySlot(T0);
    tryAcquireConcurrencySlot(T0);

    resetRateLimitStateForTests();

    expect(checkShortWindow("k", T0).allowed).toBe(true);
    expect(checkDailyQuota("k", T0).allowed).toBe(true);
    expect(checkGlobalDailyBudget(T0).allowed).toBe(true);
    expect(tryAcquireConcurrencySlot(T0)).toBe(true);
  });

  it("RL-12: the short window counts EVERY call that reaches it — 10 bare checks (no successful requests anywhere) already exhaust the window", () => {
    // Documents the "arrival counting" semantics of checkShortWindow
    // (rate-limit.ts:120-123): scripted brute force burns the window, not
    // the daily quota. No business call needed — the counter still fills.
    for (let i = 1; i <= 10; i += 1) {
      expect(checkShortWindow("k", T0 + i).allowed).toBe(true);
    }
    expect(checkShortWindow("k", T0 + 11).allowed).toBe(false);
  });
});
