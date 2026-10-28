import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MEDIA_RIGHTS, isStylePreviewPublic } from "@/lib/media-rights";
import { PRESET_WALLPAPERS } from "@/lib/wallpapers";
import { WALLPAPER_STYLES } from "@/lib/styles";

const webRoot = process.cwd();
const registry = JSON.parse(
  readFileSync(path.join(webRoot, "data", "media-rights.json"), "utf8")
) as { counts: Record<string, number>; assets: typeof MEDIA_RIGHTS };
// private-media/ is local-only (git-ignored): a fresh clone / CI has no
// archived originals, so the archive test below is conditional while every
// other test still verifies the committed metadata-only registry.
const archiveManifestPath = path.join(
  webRoot,
  "private-media",
  "archive",
  "styles",
  "manifest.json"
);
const hasPrivateMedia = existsSync(archiveManifestPath);
const archive = (hasPrivateMedia
  ? JSON.parse(readFileSync(archiveManifestPath, "utf8"))
  : { assets: [] }) as {
  assets: Array<{
    name: string;
    publicPreview: string;
    sha256: string;
    reviewStatus: string;
  }>;
};
const audit = JSON.parse(
  readFileSync(
    path.join(webRoot, "scripts", "media", "license-audit.json"),
    "utf8"
  )
) as Array<{ output: string; licenseVerified: boolean; liveLicense: string }>;

describe("asset-level media rights registry", () => {
  it("classifies every inventoried asset without auto-promoting legacy files", () => {
    expect(registry.counts).toMatchObject({
      total: 124,
      verified: 89,
      pending: 27,
      restricted: 8,
      rejected: 0,
      removed: 0,
    });
    expect(MEDIA_RIGHTS).toHaveLength(124);
    expect(MEDIA_RIGHTS.filter((a) => a.reviewStatus === "pending")).toHaveLength(27);
    expect(MEDIA_RIGHTS.filter((a) => a.reviewStatus === "restricted")).toHaveLength(8);
    expect(MEDIA_RIGHTS.filter((a) => a.reviewStatus === "verified")).toHaveLength(89);
    // The 2026-10-28 audit revoked the 2026-10-27 promotion: the 27
    // superseded legacy previews stay pending, live outside public/ under
    // the `legacy.style.*` ids, and must record why they were demoted.
    for (const asset of MEDIA_RIGHTS.filter((a) => a.reviewStatus === "pending")) {
      expect(asset.assetId.startsWith("legacy.style."), asset.assetId).toBe(true);
      expect(asset.privatePath, asset.assetId).toContain("review-pending");
      // Metadata survives without the private image bytes (fresh clone / CI).
      expect(asset.sha256, asset.assetId).toBeTruthy();
      expect(asset.licenseEvidence ?? asset.notes, asset.assetId).toMatch(
        /human review|no recorded provider/i
      );
      // Every pending legacy record has a verified same-id replacement
      // (the new independently generated preview that took over display).
      const styleId = asset.assetId.replace("legacy.style.", "");
      expect(
        MEDIA_RIGHTS.some(
          (a) => a.assetId === `style.${styleId}` && a.reviewStatus === "verified"
        ),
        asset.assetId
      ).toBe(true);
    }
  });

  it("never exposes a pending/restricted asset from public/", () => {
    for (const asset of MEDIA_RIGHTS) {
      if (asset.reviewStatus === "pending" || asset.reviewStatus === "restricted") {
        expect(asset.canPubliclyDisplay, asset.assetId).toBe(false);
        expect(asset.canOfferDownload, asset.assetId).toBe(false);
        expect(asset.publiclyAccessible, asset.assetId).toBe(false);
      }
      if (!asset.publiclyAccessible) {
        expect(asset.path.startsWith("/"), asset.assetId).toBe(false);
      }
    }
  });

  it("keeps every cleared public file present with a matching hash", () => {
    for (const asset of MEDIA_RIGHTS.filter((a) => a.publiclyAccessible)) {
      const file = path.join(webRoot, "public", asset.path.replace(/^\//, ""));
      expect(existsSync(file), asset.assetId).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.byteLength, asset.assetId).toBe(asset.bytes);
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(digest, asset.assetId).toBe(asset.sha256);
    }
  });

  it.runIf(hasPrivateMedia)(
    "archives all 31 legacy originals; every archived style has a provenance-backed public preview",
    () => {
    expect(archive.assets).toHaveLength(31);
    // The archived JPGs are NOT the source of the public webps: four styles
    // were regenerated on 2026-10-27/28 with recorded prompts, and the other
    // 27 were superseded on 2026-10-28 by independent batch-2 generations.
    // The superseded legacy webp derivatives stay quarantined under
    // private-media/review-pending/styles/ as pending records.
    const BATCH1_REGENERATED = new Set([
      "ink-drawing",
      "cosmic-horror",
      "dark-fantasy",
      "horror-anime",
    ]);
    for (const entry of archive.assets) {
      const id = entry.name.replace(/\.jpg$/, "");
      const archiveFile = path.join(
        webRoot,
        "private-media",
        "archive",
        "styles",
        entry.name
      );
      expect(existsSync(archiveFile), entry.name).toBe(true);
      const digest = createHash("sha256")
        .update(readFileSync(archiveFile))
        .digest("hex");
      expect(digest, entry.name).toBe(entry.sha256);
      // The public surface must serve the webp derivative, never the archived jpg.
      const publicJpg = path.join(
        webRoot,
        "public",
        "images",
        "styles",
        entry.name
      );
      expect(existsSync(publicJpg), entry.name).toBe(false);
      // Every archived style has a real public preview with its own
      // recorded provenance (independent generation, not this archive).
      const publicWebp = path.join(
        webRoot,
        "public",
        "images",
        "styles",
        entry.publicPreview
      );
      expect(existsSync(publicWebp), entry.name).toBe(true);
      // Superseded legacy derivatives live under
      // private-media/review-pending/styles/ (27 styles); the four
      // regenerated ones have no legacy webp left.
      const pendingWebp = path.join(
        webRoot,
        "private-media",
        "review-pending",
        "styles",
        entry.publicPreview
      );
      expect(existsSync(pendingWebp), entry.name).toBe(!BATCH1_REGENERATED.has(id));
    }
  });

  it("does not reference pending files from the exported style catalogue", () => {
    for (const style of WALLPAPER_STYLES) {
      if (!style.image) continue;
      expect(style.image.startsWith("/images/"), style.id).toBe(true);
      const publicFile = path.join(webRoot, "public", style.image.replace(/^\//, ""));
      expect(existsSync(publicFile), style.id).toBe(true);
      expect(isStylePreviewPublic(style.id), style.id).toBe(true);
    }
    // Only registry-cleared previews ship: 8 CC0/self jpgs + 46
    // project-generated webp derivatives (16 on 2026-10-27, 30 regenerated
    // on 2026-10-28 with recorded prompts). Every one of the 54 styles has
    // a real preview — no gradient fallbacks remain.
    expect(WALLPAPER_STYLES.filter((style) => Boolean(style.image))).toHaveLength(54);
    // Distinct previews: no image file stands in for two different styles.
    const images = WALLPAPER_STYLES.map((style) => style.image).filter(
      (image): image is string => Boolean(image)
    );
    expect(new Set(images).size).toBe(images.length);
  });

  it("keeps 39 pending wallpapers image-free and 18 cleared wallpapers public", () => {
    const pending = PRESET_WALLPAPERS.filter((w) => w.license === "review-pending");
    const cleared = PRESET_WALLPAPERS.filter((w) => w.license !== "review-pending");
    expect(pending).toHaveLength(39);
    expect(cleared).toHaveLength(18);
    for (const wallpaper of pending) {
      expect(wallpaper.image, wallpaper.id).toBeNull();
      expect(wallpaper.canPubliclyDisplay, wallpaper.id).toBe(false);
      expect(wallpaper.canOfferDownload, wallpaper.id).toBe(false);
    }
    for (const wallpaper of cleared) {
      expect(wallpaper.image, wallpaper.id).toBeTruthy();
      expect(wallpaper.canPubliclyDisplay, wallpaper.id).toBe(true);
      expect(wallpaper.canOfferDownload, wallpaper.id).toBe(true);
    }
    expect(
      PRESET_WALLPAPERS.find((w) => w.id === "poppy-field")?.image
    ).toBe("/images/wallpapers/poppy-field.jpg");
  });

  it("keeps CC0 evidence complete for every verified Wikimedia asset", () => {
    for (const asset of MEDIA_RIGHTS.filter(
      (a) => a.sourceType === "wikimedia-cc0"
    )) {
      expect(asset.reviewStatus, asset.assetId).toBe("verified");
      expect(asset.licenseType, asset.assetId).toBe("CC0");
      expect(asset.licenseUrl, asset.assetId).toBeTruthy();
      expect(asset.sourceUrl, asset.assetId).toBeTruthy();
      expect(asset.author, asset.assetId).toBeTruthy();
      expect(asset.licenseEvidence, asset.assetId).toBeTruthy();
      expect(asset.auditVerified, asset.assetId).toBe(true);
    }
    expect(audit).toHaveLength(24);
    expect(audit.every((item) => item.licenseVerified)).toBe(true);
    expect(audit.every((item) => item.liveLicense === "CC0")).toBe(true);
  });

  it("keeps self-authored assets honest and free of third-party sources", () => {
    const self = MEDIA_RIGHTS.filter((a) => a.sourceType === "self-authored");
    expect(self).toHaveLength(3);
    for (const asset of self) {
      expect(asset.licenseType).toBe("self-authored");
      expect(asset.sourceUrl).toBeNull();
      expect(asset.attributionRequired).toBeNull();
      expect(asset.canPubliclyDisplay).toBe(true);
    }
  });
});
