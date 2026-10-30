#!/usr/bin/env node
/**
 * Builds the published-gallery manifest consumed by the API's scheduled
 * gallery-rescan job (AIGC compliance stage 3: async re-scan of publicly
 * visible works).
 *
 * Sources (both are the existing single sources of truth):
 *  - data/media-rights.json: registry assets that are actually public
 *    (publiclyAccessible && canPubliclyDisplay) across the published
 *    AI-generated usages — gallery wallpapers, style previews, hero,
 *    studio samples, live-demo videos and posters.
 *  - data/community/works.json: published, displayable community works
 *    (preview assets).
 *
 * Output: public/gallery-manifest.json — an array of
 *   { id, type: "image"|"video", url: absolute https URL }
 * Only public data goes in (every path listed is already publicly served).
 *
 * Run: npm run community:manifest   (SITE_URL overrides the base URL)
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SITE = (process.env.SITE_URL || "https://wallhaze.com").replace(/\/$/, "");

const registry = JSON.parse(
  readFileSync(path.join(ROOT, "data", "media-rights.json"), "utf8")
);
const works = JSON.parse(
  readFileSync(path.join(ROOT, "data", "community", "works.json"), "utf8")
);

const PUBLIC_USAGES = new Set([
  "gallery-wallpaper",
  "style-preview",
  "hero",
  "studio-sample",
  "live-demo-video",
  "live-demo-poster",
]);

const entries = [];
for (const asset of registry.assets ?? []) {
  if (!PUBLIC_USAGES.has(asset.usage)) continue;
  if (!asset.publiclyAccessible || !asset.canPubliclyDisplay) continue;
  if (typeof asset.path !== "string" || !asset.path.startsWith("/")) continue;
  entries.push({
    id: asset.assetId,
    type: asset.mime?.startsWith("video/") ? "video" : "image",
    url: `${SITE}${asset.path}`,
  });
}

for (const work of works.works ?? []) {
  if (work.status !== "published" || !work.allowPublicDisplay) continue;
  if (typeof work.previewAsset !== "string" || !work.previewAsset.startsWith("/")) continue;
  entries.push({
    id: `community:${work.id}`,
    type: work.mediaType === "video" ? "video" : "image",
    url: `${SITE}${work.previewAsset}`,
  });
}

// Stable ordering keeps manifest diffs reviewable.
entries.sort((a, b) => a.id.localeCompare(b.id));

const outPath = path.join(ROOT, "public", "gallery-manifest.json");
const tmp = `${outPath}.tmp`;
writeFileSync(tmp, `${JSON.stringify(entries, null, 2)}\n`);
renameSync(tmp, outPath);

const byType = entries.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {});
console.log(`[manifest] ${entries.length} entries (${JSON.stringify(byType)}) -> ${path.relative(ROOT, outPath)}`);
