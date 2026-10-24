import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addGenerationHistory,
  loadGenerationHistory,
  removeGenerationHistoryEntry,
  type GenerationHistoryEntry,
} from "@/lib/history";
import { getBlockedNetworkCalls } from "./setup.safety";

/**
 * FE07 local-history contract (wallhaze:history:v1):
 * - single-entry removal touches exactly the requested record;
 * - the 20-entry cap is enforced on read AND on write;
 * - records whose imageUrl is not https (data:/base64 payloads) are
 *   rejected at load — image bytes never enter or leave the store;
 * - without a usable window/storage the helpers degrade to no-ops.
 *
 * The lib reads window.localStorage; the node environment gets a stubbed
 * window with an in-memory Storage, so no real browser API is involved.
 */

const STORAGE_KEY = "wallhaze:history:v1";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

let seq = 0;

function makeEntry(
  overrides: Partial<GenerationHistoryEntry> = {}
): GenerationHistoryEntry {
  seq += 1;
  return {
    id: `entry-${seq}`,
    createdAt: 1_700_000_000_000 + seq,
    prompt: `prompt ${seq}`,
    styleId: null,
    device: "phone",
    imageUrl: "https://cdn.example.com/wallpaper.png",
    width: 1080,
    height: 1920,
    hasReferenceImage: false,
    ...overrides,
  };
}

function prefill(entries: GenerationHistoryEntry[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function readRawEntries(): Array<Record<string, unknown>> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
}

describe("generation history storage (FE07)", () => {
  beforeEach(() => {
    seq = 0;
    vi.stubGlobal("window", { localStorage: createMemoryStorage() });
  });

  it("removeGenerationHistoryEntry deletes exactly the requested record", () => {
    prefill([makeEntry(), makeEntry(), makeEntry()]);
    const entries = loadGenerationHistory();
    expect(entries).toHaveLength(3);

    const target = entries[1];
    expect(removeGenerationHistoryEntry(target.id)).toBe(true);

    const remaining = loadGenerationHistory();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((entry) => entry.id)).toEqual(
      expect.not.arrayContaining([target.id])
    );
    expect(readRawEntries()).toHaveLength(2);
  });

  it("returns false for an unknown id and keeps stored data intact", () => {
    prefill([makeEntry()]);
    const before = window.localStorage.getItem(STORAGE_KEY);
    expect(removeGenerationHistoryEntry("no-such-id")).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("degrades to a no-op without a usable window/storage", () => {
    vi.stubGlobal("window", undefined);
    expect(loadGenerationHistory()).toEqual([]);
    expect(removeGenerationHistoryEntry("entry-1")).toBe(false);
  });

  it("loads at most 20 newest entries", () => {
    prefill(Array.from({ length: 25 }, () => makeEntry()));
    const loaded = loadGenerationHistory();
    expect(loaded).toHaveLength(20);
    // Written with ascending createdAt, so the load order is newest first.
    expect(loaded[0].id).toBe("entry-25");
    expect(loaded[19].id).toBe("entry-6");
  });

  it("enforces the cap when adding a new entry", () => {
    prefill(Array.from({ length: 20 }, () => makeEntry()));
    const added = addGenerationHistory({
      prompt: "fresh",
      styleId: null,
      device: "desktop",
      imageUrl: "https://cdn.example.com/fresh.png",
      width: null,
      height: null,
      hasReferenceImage: false,
    });
    expect(added).not.toBeNull();
    const loaded = loadGenerationHistory();
    expect(loaded).toHaveLength(20);
    expect(loaded[0].id).toBe(added?.id);
    // The oldest record was evicted, not the fresh one.
    expect(loaded.map((entry) => entry.id)).not.toContain("entry-1");
  });

  it("drops records whose imageUrl is not https (no data:/base64 payloads)", () => {
    const leaked = makeEntry({
      id: "leaky",
      imageUrl: "data:image/png;base64,QUJDRA==",
    });
    prefill([makeEntry({ id: "clean" }), leaked]);
    const loaded = loadGenerationHistory();
    expect(loaded.map((entry) => entry.id)).toEqual(["clean"]);
  });

  it("never attempts outbound network access", () => {
    prefill([makeEntry()]);
    loadGenerationHistory();
    removeGenerationHistoryEntry("entry-1");
    expect(getBlockedNetworkCalls()).toHaveLength(0);
  });
});
