#!/usr/bin/env node
/**
 * Minimal human-in-the-loop takedown/restore CLI.
 *
 * This is deliberately NOT an auto-approval tool:
 * - takedown moves a public file outside public/ and records who/why;
 * - restore only publishes a file when a reviewer explicitly supplies
 *   --decision verified plus evidence and licence fields.
 *
 * Usage:
 *   node scripts/media/rights-admin.mjs takedown --asset style.abstract \
 *     --reviewer alice --reason "Commons file deleted"
 *   node scripts/media/rights-admin.mjs restore --asset style.abstract \
 *     --reviewer alice --decision verified --license CC0-1.0 \
 *     --license-url https://... --evidence "Commons page + archive" \
 *     --reason "Reviewed 2026-10-24"
 *   node scripts/media/rights-admin.mjs restore --asset style.abstract \
 *     --reviewer alice --decision rejected --reason "No permission"
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const ROOT = process.cwd();
const REGISTRY = join(ROOT, "data", "media-rights.json");
const LOG = join(ROOT, "private-media", "review-pending", "audit-log.jsonl");
const args = process.argv.slice(2);
const command = args.shift();
const flags = Object.fromEntries(
  args.reduce((acc, item, index, list) => {
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = list[index + 1];
      acc.push([key, next && !next.startsWith("--") ? next : "1"]);
    }
    return acc;
  }, [])
);

const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
const asset = registry.assets.find((item) => item.assetId === flags.asset);
if (!asset) {
  console.error(`[rights] unknown asset: ${flags.asset ?? "(missing --asset)"}`);
  process.exit(1);
}
const reviewer = flags.reviewer;
const reason = flags.reason;
if (!reviewer || !reason) {
  console.error("[rights] --reviewer and --reason are required");
  process.exit(1);
}

const posix = (value) => value.replaceAll("\\", "/");
const rel = (value) => posix(relative(ROOT, value));
const ext = extname(asset.path) || extname(asset.privatePath ?? "") || ".bin";

function originalPublicPath() {
  if (asset.assetId.startsWith("style.")) {
    // Keep the original extension: previews may be .jpg (CC0) or .webp
    // (project-generated derivatives).
    return `/images/styles/${asset.assetId.slice("style.".length)}${ext}`;
  }
  if (asset.assetId.startsWith("wallpaper.")) {
    return `/images/wallpapers/${asset.assetId.slice("wallpaper.".length)}${ext}`;
  }
  if (asset.assetId.startsWith("video.")) {
    return `/videos/live-demos/${asset.assetId.slice("video.".length)}.mp4`;
  }
  if (asset.assetId.startsWith("poster.")) {
    return `/videos/live-demos/${asset.assetId.slice("poster.".length)}.jpg`;
  }
  if (asset.assetId.startsWith("frame.")) {
    return `/videos/live-demos/${asset.assetId.slice("frame.".length)}-frame.jpg`;
  }
  if (asset.path.startsWith("/")) return asset.path;
  throw new Error(`cannot derive a public path for ${asset.assetId}`);
}

function audit(action, extra = {}) {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(
    LOG,
    `${JSON.stringify({
      at: new Date().toISOString(),
      action,
      assetId: asset.assetId,
      reviewer,
      reason,
      ...extra,
    })}\n`
  );
}

function save() {
  writeFileSync(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`);
}

if (command === "takedown") {
  if (!asset.publiclyAccessible) {
    console.error(`[rights] ${asset.assetId} is already non-public (${asset.reviewStatus})`);
    process.exit(1);
  }
  const source = join(ROOT, "public", asset.path.replace(/^\//, ""));
  if (!existsSync(source)) {
    console.error(`[rights] public file missing: ${asset.path}`);
    process.exit(1);
  }
  const destination = join(
    ROOT,
    "private-media",
    "review-pending",
    "takedown",
    `${asset.assetId.replaceAll(".", "-")}${ext}`
  );
  if (existsSync(destination)) {
    console.error(`[rights] destination exists; refusing to overwrite: ${rel(destination)}`);
    process.exit(1);
  }
  mkdirSync(dirname(destination), { recursive: true });
  renameSync(source, destination);
  asset.path = rel(destination);
  asset.privatePath = rel(destination);
  asset.publiclyAccessible = false;
  asset.canPubliclyDisplay = false;
  asset.canOfferDownload = false;
  asset.reviewStatus = "restricted";
  asset.reviewedAt = new Date().toISOString().slice(0, 10);
  asset.reviewedBy = reviewer;
  asset.notes = `${asset.notes} Takedown: ${reason}`;
  audit("takedown", { from: source, to: rel(destination) });
  save();
  console.log(JSON.stringify({ ok: true, action: "takedown", assetId: asset.assetId, privatePath: asset.privatePath }, null, 2));
  process.exit(0);
}

if (command === "restore") {
  if (!asset.privatePath || asset.publiclyAccessible) {
    console.error(`[rights] ${asset.assetId} has no quarantined local file to restore`);
    process.exit(1);
  }
  const decision = flags.decision;
  if (!["verified", "rejected", "removed"].includes(decision)) {
    console.error("[rights] --decision must be verified, rejected or removed");
    process.exit(1);
  }
  if (decision !== "verified") {
    asset.reviewStatus = decision;
    asset.reviewedAt = new Date().toISOString().slice(0, 10);
    asset.reviewedBy = reviewer;
    asset.notes = `${asset.notes} Review decision ${decision}: ${reason}`;
    audit("review", { decision });
    save();
    console.log(JSON.stringify({ ok: true, action: "review", assetId: asset.assetId, decision }, null, 2));
    process.exit(0);
  }
  if (!flags.evidence || !flags.license) {
    console.error("[rights] verified requires --evidence and --license (no auto-approved restore)");
    process.exit(1);
  }
  const publicPath = originalPublicPath();
  const source = join(ROOT, asset.privatePath);
  const destination = join(ROOT, "public", publicPath.replace(/^\//, ""));
  if (!existsSync(source)) {
    console.error(`[rights] quarantined file missing: ${asset.privatePath}`);
    process.exit(1);
  }
  if (existsSync(destination)) {
    console.error(`[rights] public destination already exists: ${publicPath}`);
    process.exit(1);
  }
  mkdirSync(dirname(destination), { recursive: true });
  renameSync(source, destination);
  asset.path = publicPath;
  asset.privatePath = null;
  asset.publiclyAccessible = true;
  asset.canPubliclyDisplay = true;
  asset.canOfferDownload = flags["display-only"] === "1" ? false : true;
  asset.reviewStatus = "verified";
  asset.licenseType = flags.license;
  asset.licenseUrl = flags["license-url"] ?? null;
  asset.licenseEvidence = flags.evidence;
  asset.reviewedAt = new Date().toISOString().slice(0, 10);
  asset.reviewedBy = reviewer;
  asset.attributionText = flags.attribution ?? null;
  asset.notes = `${asset.notes} Verified restore: ${reason}`;
  audit("restore", {
    publicPath,
    license: flags.license,
    licenseUrl: flags["license-url"] ?? null,
    evidence: flags.evidence,
    displayOnly: flags["display-only"] === "1",
  });
  save();
  console.log(JSON.stringify({ ok: true, action: "restore", assetId: asset.assetId, publicPath, canOfferDownload: asset.canOfferDownload }, null, 2));
  process.exit(0);
}

console.error("usage: rights-admin.mjs takedown|restore --asset <id> --reviewer <name> --reason <text> [...]");
process.exit(1);
