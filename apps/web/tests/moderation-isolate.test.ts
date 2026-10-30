import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isolateFlaggedEntry,
  isolationRoots,
  WITHDRAWN_STATUS,
} from "../scripts/community/moderation-isolate.mjs";

/**
 * Auto-isolation policy checks: community works are hidden (file MOVED to
 * the moderation quarantine — bytes preserved, never deleted) and the work
 * is withdrawn from every public surface; registry-managed assets are only
 * recorded for the manual media-rights CLI. The restore path stays human.
 */

function makeFakeWebRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "isolate-test-"));
  mkdirSync(path.join(root, "data", "community"), { recursive: true });
  mkdirSync(path.join(root, "public", "community", "previews"), { recursive: true });
  writeFileSync(
    path.join(root, "data", "community", "works.json"),
    JSON.stringify({
      version: 1,
      works: [
        {
          id: "w1",
          status: "published",
          previewAsset: "/community/previews/w1.jpg",
        },
        {
          id: "w2",
          status: "published",
          previewAsset: "/community/previews/w2.jpg",
        },
      ],
    })
  );
  writeFileSync(path.join(root, "public", "community", "previews", "w1.jpg"), "JPEGBYTES-w1");
  writeFileSync(path.join(root, "public", "community", "previews", "w2.jpg"), "JPEGBYTES-w2");
  return root;
}

describe("gallery auto-isolation", () => {
  let root: string;
  let roots: ReturnType<typeof isolationRoots>;

  beforeEach(() => {
    root = makeFakeWebRoot();
    roots = isolationRoots(root);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("moves the community preview to quarantine and withdraws the work", () => {
    const result = isolateFlaggedEntry(
      { id: "community:w1", type: "image", url: "https://x/community/previews/w1.jpg" },
      roots
    );
    expect(result.isolated).toBe(true);
    // The public file is GONE from public/…
    expect(existsSync(path.join(root, "public", "community", "previews", "w1.jpg"))).toBe(false);
    // …but the original bytes are preserved in the quarantine.
    const quarantined = (result as { file?: string }).file as string;
    expect(quarantined.startsWith(path.join(root, "private-media", "moderation", "quarantine"))).toBe(true);
    expect(readFileSync(quarantined, "utf8")).toBe("JPEGBYTES-w1");
    // The work is withdrawn: no public surface serves it anymore.
    const works = JSON.parse(readFileSync(path.join(root, "data", "community", "works.json"), "utf8"));
    expect(works.works.find((w: { id: string }) => w.id === "w1").status).toBe(WITHDRAWN_STATUS);
    // The audit trail records the human restore path.
    const audit = readFileSync(path.join(root, "private-media", "moderation", "isolation-log.jsonl"), "utf8");
    expect(audit).toContain("auto_isolate");
    expect(audit).toContain("restore");
  });

  it("is idempotent for an already-withdrawn work", () => {
    isolateFlaggedEntry({ id: "community:w1", type: "image", url: "https://x/w1.jpg" }, roots);
    const second = isolateFlaggedEntry(
      { id: "community:w1", type: "image", url: "https://x/w1.jpg" },
      roots
    );
    expect(second).toMatchObject({ isolated: false, handling: "already_isolated" });
  });

  it("never touches registry-managed assets — records the rights-CLI path instead", () => {
    const result = isolateFlaggedEntry(
      { id: "wallpaper.aurora-veil", type: "image", url: "https://x/images/wallpapers/aurora-veil.jpg" },
      roots
    );
    expect(result).toMatchObject({ isolated: false, handling: "registry_owned_manual_rights_cli" });
    expect(existsSync(path.join(root, "public", "images", "wallpapers"))).toBe(false);
    const audit = readFileSync(path.join(root, "private-media", "moderation", "isolation-log.jsonl"), "utf8");
    expect(audit).toContain("registry_owned_manual_rights_cli");
    // works.json untouched.
    const works = JSON.parse(readFileSync(path.join(root, "data", "community", "works.json"), "utf8"));
    expect(works.works.every((w: { status: string }) => w.status === "published")).toBe(true);
  });

  it("records unknown community ids without failing the scan", () => {
    const result = isolateFlaggedEntry({ id: "community:ghost", type: "image", url: "https://x/g.jpg" }, roots);
    expect(result).toMatchObject({ isolated: false, handling: "work_not_found" });
  });
});
