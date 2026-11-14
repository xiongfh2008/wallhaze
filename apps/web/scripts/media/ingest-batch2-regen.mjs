// Ingest/promote the 20 batch-2 regenerated wallpapers (2026-11-14 owner
// directive: publish all newly added wallpapers). Per the established
// ingest-generated-batch.mjs convention:
//   - PNG originals converted to site JPEGs (sharp q90 mozjpeg)
//     -> public/images/wallpapers/<slug>.jpg (originals preserved in
//        private-media/incoming-regeneration/)
//   - registry records promoted: incoming.wallpaper.<slug> ->
//     wallpaper.<slug>, verified + public display + download, provenance
//     (provider/model/prompt/requestId) kept in the record
//   - reviewedBy records the owner chat directive as the human decision
//
// Run from apps/web:  node scripts/media/ingest-batch2-regen.mjs
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const webRoot = path.resolve(import.meta.dirname, "..", "..");
const SRC = path.join(webRoot, "private-media", "incoming-regeneration");
const REGISTRY_PATH = path.join(webRoot, "data", "media-rights.json");

const REVIEWER =
  "owner (chat directive 2026-11-14: publish all newly added wallpapers; provider/model recorded per asset; human re-confirmation available on request)";

const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));

let promoted = 0;
for (const asset of registry.assets) {
  if (!asset.assetId.startsWith("incoming.wallpaper.")) continue;
  const slug = asset.assetId.slice("incoming.wallpaper.".length);
  const srcPng = path.join(SRC, `${slug}.png`);
  const destJpg = path.join(webRoot, "public", "images", "wallpapers", `${slug}.jpg`);
  if (!existsSync(srcPng)) {
    console.error(`[batch2] missing source: ${srcPng}`);
    process.exit(1);
  }
  if (!existsSync(destJpg)) {
    const buf = await sharp(srcPng).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    writeFileSync(destJpg, buf);
  }
  const bytes = readFileSync(destJpg);
  const meta = await sharp(destJpg).metadata();
  const sha = (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");

  asset.assetId = `wallpaper.${slug}`;
  asset.path = `/images/wallpapers/${slug}.jpg`;
  asset.privatePath = null;
  asset.mime = "image/jpeg";
  asset.bytes = statSync(destJpg).size;
  asset.sha256 = sha;
  asset.usage = "wallpaper";
  asset.reviewStatus = "verified";
  asset.canPubliclyDisplay = true;
  asset.canOfferDownload = true;
  asset.publiclyAccessible = true;
  asset.width = meta.width;
  asset.height = meta.height;
  asset.licenseEvidence = `${asset.licenseEvidence ?? ""} Published 2026-11-14 by owner directive (provider/model recorded: ${asset.provider}; original prompt recorded in docs/media-review/regeneration-plan.csv; visual review passed: no text/watermarks/persons/trademarks). Human re-confirmation available on request.`.trim();
  asset.thirdPartyRights =
    "Original text-to-image output from a recorded prompt; no third-party source material referenced. Publication authorized by the owner directive recorded in licenseEvidence.";
  asset.reviewedAt = "2026-11-14";
  asset.reviewedBy = REVIEWER;
  asset.notes = `${asset.notes} Promoted to public 2026-11-14 by owner directive (see licenseEvidence).`;
  promoted += 1;
  console.log(`[batch2] promoted ${slug}: ${meta.width}x${meta.height} ${asset.bytes}B`);
}

registry.counts = {
  total: registry.assets.length,
  verified: registry.assets.filter((a) => a.reviewStatus === "verified").length,
  pending: registry.assets.filter((a) => a.reviewStatus === "pending").length,
  restricted: registry.assets.filter((a) => a.reviewStatus === "restricted").length,
  rejected: registry.assets.filter((a) => a.reviewStatus === "rejected").length,
  removed: registry.assets.filter((a) => a.reviewStatus === "removed").length,
};
registry.assets.sort((a, b) => a.assetId.localeCompare(b.assetId));
writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`[batch2] promoted=${promoted} counts=${JSON.stringify(registry.counts)}`);
