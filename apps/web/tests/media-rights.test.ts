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
const quarantine = JSON.parse(
  readFileSync(
    path.join(webRoot, "private-media", "review-pending", "manifest.json"),
    "utf8"
  )
) as { assets: Array<{ name: string; sha256: string; originalPublicPath: string }> };
const audit = JSON.parse(
  readFileSync(
    path.join(webRoot, "scripts", "media", "license-audit.json"),
    "utf8"
  )
) as Array<{ output: string; licenseVerified: boolean; liveLicense: string }>;

describe("asset-level media rights registry", () => {
  it("classifies every inventoried asset without auto-promoting legacy files", () => {
    expect(registry.counts).toMatchObject({
      total: 82,
      verified: 43,
      pending: 31,
      restricted: 8,
      rejected: 0,
      removed: 0,
    });
    expect(MEDIA_RIGHTS).toHaveLength(82);
    expect(MEDIA_RIGHTS.filter((a) => a.reviewStatus === "pending")).toHaveLength(31);
    expect(MEDIA_RIGHTS.filter((a) => a.reviewStatus === "restricted")).toHaveLength(8);
    expect(MEDIA_RIGHTS.filter((a) => a.reviewStatus === "verified")).toHaveLength(43);
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

  it("moves all 31 legacy style previews out of public with original mappings", () => {
    expect(quarantine.assets).toHaveLength(31);
    for (const entry of quarantine.assets) {
      const publicFile = path.join(
        webRoot,
        "public",
        entry.originalPublicPath.replace(/^\//, "")
      );
      const privateFile = path.join(
        webRoot,
        "private-media",
        "review-pending",
        "styles",
        entry.name
      );
      expect(existsSync(publicFile), entry.name).toBe(false);
      expect(existsSync(privateFile), entry.name).toBe(true);
      const digest = createHash("sha256")
        .update(readFileSync(privateFile))
        .digest("hex");
      expect(digest, entry.name).toBe(entry.sha256);
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
    // Only the eight cleared style previews survive the sanitizer.
    expect(WALLPAPER_STYLES.filter((style) => Boolean(style.image))).toHaveLength(8);
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
