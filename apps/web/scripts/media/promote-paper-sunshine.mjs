#!/usr/bin/env node
/**
 * Completes the registry metadata for the three promoted Paper Sunshine
 * wallpapers after `rights-admin.mjs restore` moved their original PNGs to
 * public/images/wallpapers/ (verified + owner release recorded there).
 *
 * restore only writes the mechanical fields (path, flags, license, reviewer).
 * This script records the identified generation provider, replaces the now
 * stale review-pending notes with the publication decision, and refreshes the
 * header counts. It is deliberately scoped to exactly the three assetIds and
 * refuses to run when the preconditions are not met, so re-running is safe
 * and no other record can be touched.
 *
 * Usage: node scripts/media/promote-paper-sunshine.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const REGISTRY = join(ROOT, "data", "media-rights.json");

const SLUGS = [
  "spinning-into-sunshine",
  "room-for-a-happy-dance",
  "one-bright-step",
];

const EXPECTED = {
  sourceType: "user-ai-generated",
  provider:
    "ChatGPT / OpenAI (per source-file metadata and owner statement; output display/download terms not independently verified)",
  licenseType: "user-ai-generated; owner release",
};

const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
const changed = [];

for (const slug of SLUGS) {
  const asset = registry.assets.find(
    (item) => item.assetId === `incoming.wallpaper.${slug}`
  );
  if (!asset) {
    console.error(`[promote] missing record: incoming.wallpaper.${slug}`);
    process.exit(1);
  }
  if (
    asset.assetId !== `incoming.wallpaper.${slug}` ||
    !asset.path.startsWith("/")
  ) {
    console.error(`[promote] ${asset.assetId}: unexpected record shape`);
    process.exit(1);
  }
  if (asset.path !== `/images/wallpapers/${slug}.png`) {
    console.error(
      `[promote] ${asset.assetId}: not at the expected public path (${asset.path})`
    );
    process.exit(1);
  }
  if (asset.licenseType !== EXPECTED.licenseType) {
    console.error(
      `[promote] ${asset.assetId}: licenseType is "${asset.licenseType}" — run rights-admin.mjs restore first`
    );
    process.exit(1);
  }
  const file = join(ROOT, "public", asset.path.replace(/^\//, ""));
  if (!existsSync(file)) {
    console.error(`[promote] ${asset.assetId}: public file missing`);
    process.exit(1);
  }
  const bytes = readFileSync(file);
  if (asset.bytes !== null && bytes.byteLength !== asset.bytes) {
    console.error(`[promote] ${asset.assetId}: byte size drift`);
    process.exit(1);
  }
  if (asset.sha256 && createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
    console.error(`[promote] ${asset.assetId}: hash drift`);
    process.exit(1);
  }

  const before = JSON.stringify({
    sourceType: asset.sourceType,
    provider: asset.provider,
    thirdPartyRights: asset.thirdPartyRights,
    notes: asset.notes,
  });
  asset.sourceType = EXPECTED.sourceType;
  asset.provider = EXPECTED.provider;
  asset.thirdPartyRights =
    "None known: user-provided AI-generated artwork (ChatGPT per source-file metadata), original character, no third-party source material; publication and free download authorized by the owner directive recorded in licenseEvidence.";
  asset.notes =
    `User-provided AI-generated wallpaper (Paper Sunshine batch 2026-11-15, seed ${slug}); published by owner directive with the generation provider recorded from the source-file metadata. Original PNG published as-is (no re-encode; download serves the reviewed original bytes). ` +
    (slug === "room-for-a-happy-dance"
      ? "The left-side cream negative space is intentional composition (desktop icon area) — never auto-crop. "
      : "") +
    "Takedown: node scripts/media/rights-admin.mjs takedown --asset " +
    asset.assetId +
    " ...";
  if (before !== JSON.stringify({ sourceType: asset.sourceType, provider: asset.provider, thirdPartyRights: asset.thirdPartyRights, notes: asset.notes })) {
    changed.push(asset.assetId);
  }
}

registry.counts = {
  total: registry.assets.length,
  verified: registry.assets.filter((a) => a.reviewStatus === "verified").length,
  pending: registry.assets.filter((a) => a.reviewStatus === "pending").length,
  restricted: registry.assets.filter((a) => a.reviewStatus === "restricted").length,
  rejected: registry.assets.filter((a) => a.reviewStatus === "rejected").length,
  removed: registry.assets.filter((a) => a.reviewStatus === "removed").length,
};

writeFileSync(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`);
console.log(
  JSON.stringify(
    { ok: true, updated: changed, counts: registry.counts },
    null,
    2
  )
);
