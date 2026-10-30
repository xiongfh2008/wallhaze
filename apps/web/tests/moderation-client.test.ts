import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { screenMediaFile, moderationConfigured } from "../scripts/community/output-moderation.mjs";

/**
 * Reviewer-side output moderation client (import gate + local gallery
 * scans). Mirrors the API's OutputModerationService decisions and fails
 * closed in every unresolvable case.
 */

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const openaiBody = (flagged: boolean, categories: Record<string, boolean> = {}) => ({
  results: [{ flagged, categories }],
});

async function tempFile(bytes: Buffer, name: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "webmod-test-"));
  const file = path.join(dir, name);
  await writeFile(file, bytes);
  return file;
}

describe("output moderation client (web scripts)", () => {
  beforeEach(() => {
    vi.stubEnv("OUTPUT_MODERATION_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports unconfigured when no API key is set, without any request", async () => {
    vi.stubEnv("OUTPUT_MODERATION_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(moderationConfigured()).toBe(false);
    const file = await tempFile(PNG, "a.png");
    const verdict = await screenMediaFile(file, "image");
    expect(verdict.action).toBe("unavailable");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows clean images and blocks flagged ones with categories", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(openaiBody(false)), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(openaiBody(true, { sexual: true })), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchSpy);
    const file = await tempFile(PNG, "a.png");
    expect((await screenMediaFile(file, "image")).action).toBe("allow");
    const blocked = await screenMediaFile(file, "image");
    expect(blocked).toMatchObject({ action: "block", categories: ["sexual"] });
  });

  it("fails closed on provider errors and unknown shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 }))
    );
    const file = await tempFile(PNG, "a.png");
    expect(await screenMediaFile(file, "image")).toMatchObject({
      action: "unavailable",
      status: 503,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpected: true }), { status: 200 })
      )
    );
    expect((await screenMediaFile(file, "image")).action).toBe("unavailable");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    expect((await screenMediaFile(file, "image")).action).toBe("unavailable");
  });

  it("fails closed for videos when ffmpeg is unavailable (this host)", async () => {
    vi.stubEnv("FFMPEG_PATH", "definitely-not-installed-ffmpeg");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const file = await tempFile(PNG, "a.mp4");
    const verdict = await screenMediaFile(file, "video");
    expect(verdict.action).toBe("unavailable");
    // No moderation request can be made for media whose frames cannot be
    // extracted — that is the fail-closed guarantee.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("screens the gallery manifest entries as https URLs of the right types", async () => {
    const manifest = JSON.parse(
      await import("node:fs").then((fs) =>
        fs.readFileSync(path.join(process.cwd(), "public", "gallery-manifest.json"), "utf8")
      )
    );
    expect(manifest.length).toBeGreaterThan(0);
    for (const entry of manifest) {
      expect(entry.url.startsWith("https://")).toBe(true);
      expect(["image", "video"]).toContain(entry.type);
      expect(entry.id.length).toBeGreaterThan(0);
    }
  });
});
