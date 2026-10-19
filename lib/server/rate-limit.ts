/**
 * Stage 4.4-A in-process rate limiting for the generation API.
 *
 * IMPORTANT — documented boundaries (do not oversell in reports):
 * - Single-instance only: state lives in this process's memory.
 * - Counters reset when the process restarts (dev hot-reload included).
 * - Multiple instances never share state — with N instances the effective
 *   limits become N× the values below. Migrate to a shared store (Redis/KV)
 *   before running more than one instance.
 * - This is a REQUEST-COUNT circuit breaker, not a real-cost budget: it never
 *   measures actual fal.ai spending.
 * - At the limit, NEW requests are rejected; in-flight upstream tasks are
 *   unaffected and end naturally via the 120s upstream timeout.
 *
 * Concurrency model: every check-and-increment below is synchronous (no
 * `await` between check and increment), so Node's single-threaded event loop
 * makes them atomic within this process — no async race windows exist.
 *
 * Memory safety: tracked keys are swept lazily (expired windows, stale days)
 * and the short-window map is hard-capped, so attacker-supplied key sprawl
 * cannot grow memory without bound. Concurrency slots carry timestamps and
 * are reclaimed after the upstream timeout + buffer, so a missed release
 * degrades gracefully instead of permanently shrinking capacity.
 */

/** Short window: reject requests beyond this many per rolling-fixed window. */
const SHORT_WINDOW_MS = 60_000;
const SHORT_WINDOW_LIMIT = 10;

/** Per-client daily submission quota (UTC day). */
const DAILY_LIMIT_PER_KEY = 30;

/** Global daily submission budget across all clients (UTC day). */
const GLOBAL_DAILY_LIMIT = 200;

/** Maximum concurrent upstream generation tasks. */
const CONCURRENCY_LIMIT = 3;

/**
 * A slot older than this is reclaimable even if its release was missed:
 * the upstream fetch aborts at 120s, so nothing real can still be running.
 * (120s timeout + 30s buffer.)
 */
const STALE_SLOT_MS = 150_000;

/**
 * Hard cap on tracked rate-limit keys. With the current single shared bucket
 * this is never approached; it exists so that enabling a per-client key
 * scheme later cannot turn the map into an unbounded memory leak.
 */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the client may retry — set on rejections (429 responses). */
  retryAfterSeconds?: number;
}

interface WindowCounter {
  windowStart: number;
  count: number;
}

interface DailyCounter {
  /** UTC calendar day ("YYYY-MM-DD") this counter belongs to. */
  dayKey: string;
  count: number;
}

const shortWindows = new Map<string, WindowCounter>();
const dailyCounters = new Map<string, DailyCounter>();
const globalDaily: DailyCounter = { dayKey: utcDayKey(Date.now()), count: 0 };
/** Timestamps of acquired slots, oldest first (FIFO keeps staleness checks valid). */
const activeSlotTimestamps: number[] = [];

let lastSweepAt = 0;

/** UTC calendar day key for an epoch-milliseconds timestamp. */
function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Seconds until the next UTC midnight (minimum 1) — for Retry-After. */
function secondsUntilUtcMidnight(now: number): number {
  const current = new Date(now);
  const nextMidnight = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((nextMidnight - now) / 1000));
}

/** Drops expired windows, stale daily counters and provably-finished slots. */
function sweep(now: number): void {
  for (const [key, entry] of shortWindows) {
    if (now - entry.windowStart >= SHORT_WINDOW_MS) shortWindows.delete(key);
  }
  const today = utcDayKey(now);
  for (const [key, entry] of dailyCounters) {
    if (entry.dayKey !== today) dailyCounters.delete(key);
  }
  while (
    activeSlotTimestamps.length > 0 &&
    now - activeSlotTimestamps[0] > STALE_SLOT_MS
  ) {
    activeSlotTimestamps.shift();
  }
}

/** Sweeps at most once per short window — amortized, no per-request cost. */
function sweepIfNeeded(now: number): void {
  if (now - lastSweepAt >= SHORT_WINDOW_MS) {
    lastSweepAt = now;
    sweep(now);
  }
}

/**
 * Short-window limiter — counts EVERY request that reaches it (including
 * ones later rejected by validation), so scripted brute forcing burns the
 * window instead of the daily quota. Check and increment are synchronous.
 */
export function checkShortWindow(
  key: string,
  now: number = Date.now()
): RateLimitDecision {
  sweepIfNeeded(now);
  let entry = shortWindows.get(key);
  if (!entry || now - entry.windowStart >= SHORT_WINDOW_MS) {
    if (shortWindows.size >= MAX_TRACKED_KEYS) sweep(now);
    entry = { windowStart: now, count: 0 };
    shortWindows.set(key, entry);
  }
  if (entry.count >= SHORT_WINDOW_LIMIT) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.windowStart + SHORT_WINDOW_MS - now) / 1000)
    );
    return { allowed: false, retryAfterSeconds };
  }
  entry.count += 1;
  return { allowed: true };
}

/**
 * Per-client daily quota — call ONLY after all validation has passed, right
 * before the upstream call. "Submission" semantics: counted even if the
 * upstream call later fails (conservative, and a failed upstream call may
 * already have cost money). Check and increment are synchronous.
 */
export function checkDailyQuota(
  key: string,
  now: number = Date.now()
): RateLimitDecision {
  const today = utcDayKey(now);
  let entry = dailyCounters.get(key);
  if (!entry || entry.dayKey !== today) {
    if (dailyCounters.size >= MAX_TRACKED_KEYS) sweep(now);
    entry = { dayKey: today, count: 0 };
    dailyCounters.set(key, entry);
  }
  if (entry.count >= DAILY_LIMIT_PER_KEY) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }
  entry.count += 1;
  return { allowed: true };
}

/**
 * Global daily request budget (request-count circuit breaker — NOT a
 * real-cost budget). Same submission semantics as {@link checkDailyQuota}.
 * When the limit is reached every further request is rejected until the UTC
 * day rolls over.
 */
export function checkGlobalDailyBudget(
  now: number = Date.now()
): RateLimitDecision {
  const today = utcDayKey(now);
  if (globalDaily.dayKey !== today) {
    globalDaily.dayKey = today;
    globalDaily.count = 0;
  }
  if (globalDaily.count >= GLOBAL_DAILY_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }
  globalDaily.count += 1;
  return { allowed: true };
}

/**
 * Acquires one concurrency slot. Call only after validation, immediately
 * before the upstream fetch. Slots are timestamped and reclaimed after
 * STALE_SLOT_MS, so a missed release self-heals instead of leaking capacity.
 */
export function tryAcquireConcurrencySlot(now: number = Date.now()): boolean {
  while (
    activeSlotTimestamps.length > 0 &&
    now - activeSlotTimestamps[0] > STALE_SLOT_MS
  ) {
    activeSlotTimestamps.shift();
  }
  if (activeSlotTimestamps.length >= CONCURRENCY_LIMIT) return false;
  activeSlotTimestamps.push(now);
  return true;
}

/** Releases one concurrency slot. Must be paired with a successful acquire. */
export function releaseConcurrencySlot(): void {
  activeSlotTimestamps.shift();
}

/**
 * Test-only reset of all limiter state. Never call from production code.
 */
export function resetRateLimitStateForTests(): void {
  shortWindows.clear();
  dailyCounters.clear();
  globalDaily.dayKey = utcDayKey(Date.now());
  globalDaily.count = 0;
  activeSlotTimestamps.length = 0;
  lastSweepAt = 0;
}
