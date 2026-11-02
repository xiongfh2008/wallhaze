// Generate the pending-wallpapers review CSV + Markdown report.
// Read-only: does not modify any asset, license, or review status.
// Run: node scripts/media/generate-review-report.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "..", "..");
const reg = JSON.parse(
  readFileSync(path.join(webRoot, "data", "media-rights.json"), "utf8")
);
const ts = readFileSync(path.join(webRoot, "lib", "wallpapers.ts"), "utf8");

// Parse SEEDS
const sIdx = ts.indexOf("const SEEDS"), eIdx = ts.indexOf("] satisfies", sIdx);
const seeds = ts.slice(sIdx, eIdx);
const blocks = seeds.split("\n  {").slice(1);
const entries = [];
for (const block of blocks) {
  const id = (block.match(/"([a-z0-9-]+)"/) || [])[1];
  if (!id) continue;
  const lic = (block.match(/license: "([a-z-]+)"/) || [])[1] || "review-pending";
  const title = (block.match(/title: "([^"]+)"/) || [])[1] || "";
  const styleId = (block.match(/styleId: "([a-z0-9-]+)"/) || [])[1] || "";
  const alt = (block.match(/alt: "([^"]+)"/) || [])[1] || "";
  entries.push({ id, lic, title, styleId, alt });
}
const pending = entries.filter(e => e.lic === "review-pending");

// Search for image files
function findFiles(id) {
  const hits = [];
  const dirs = ["public/", "private-media/"];
  for (const dir of dirs) {
    const full = path.join(webRoot, dir);
    if (!existsSync(full)) continue;
    try {
      const items = readdirRecursive(full);
      for (const item of items) {
        if (item.includes(id) && /\.(jpg|jpeg|png|webp)$/i.test(item)) hits.push(item);
      }
    } catch {}
  }
  return hits;
}
function readdirRecursive(dir) {
  const out = [];
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) out.push(...readdirRecursive(full));
      else out.push(full);
    }
  } catch {}
  return out;
}

// Registry lookups
const registryByWallpaper = new Map(
  reg.assets.filter(a => a.assetId.startsWith("wallpaper.")).map(a => [a.assetId.replace("wallpaper.", ""), a])
);
const stylePreviewByStyle = new Map(
  reg.assets.filter(a => a.usage === "style-preview" && a.reviewStatus === "verified" && a.canPubliclyDisplay)
    .map(a => [a.assetId.replace("style.", ""), a])
);

// Check existing 48 originals for title/alt collision
const existingOriginals = new Set();
for (const a of reg.assets) {
  if (a.usage === "gallery-wallpaper" && a.reviewStatus === "verified") {
    existingOriginals.add(a.assetId.replace("wallpaper.", ""));
  }
}

const CSV_HEADER = "wallpaperId,title,styleId,assetId,actualFile,fileSha256,sourceType,generationProvider,generationDate,licenseEvidence,displayPermission,downloadPermission,descriptionMatch,decision,missingEvidence,recommendedAction";

const csvRows = [CSV_HEADER];
const mdRows = [];
let stats = { hasFile: 0, hasEvidence: 0, canDisplay: 0, canDownload: 0, keepIsolated: 0, regenerate: 0, duplicate: 0 };

for (const p of pending) {
  const regEntry = registryByWallpaper.get(p.id);
  const files = findFiles(p.id);
  const hasFile = files.length > 0;
  const sha = hasFile ? createHash("sha256").update(readFileSync(files[0])).digest("hex") : "";
  const stylePreview = stylePreviewByStyle.get(p.styleId);
  const hasPreview = Boolean(stylePreview);
  const wouldDuplicate = hasPreview && existingOriginals.size > 0; // all would share the style preview

  // Decision logic
  let decision, missing, action;
  if (hasFile && regEntry && regEntry.licenseType !== "unknown" && regEntry.licenseEvidence) {
    decision = "NEEDS_MANUAL_REVIEW";
    missing = "file exists and has registry entry; human rights review required";
    action = "Human rights review, then approve if evidence is sufficient";
  } else if (hasFile && !regEntry) {
    decision = "NEEDS_MANUAL_REVIEW";
    missing = "image file exists but has no registry entry, no license evidence";
    action = "Create registry entry with provenance, then human rights review";
  } else {
    decision = "REPLACE_WITH_NEW_ORIGINAL";
    missing = "no image file, no registry entry, no source URL, no license evidence, no generation record";
    action = hasPreview
      ? "Generate a new original via the offline AI pipeline using this concept as the prompt basis; style preview already exists for " + p.styleId
      : "Generate a new original via the offline AI pipeline; no style preview exists either";
    stats.regenerate++;
  }

  if (hasFile) stats.hasFile++;
  if (regEntry && regEntry.licenseType !== "unknown") stats.hasEvidence++;
  if (wouldDuplicate) stats.duplicate++;
  stats.keepIsolated++;

  const display = "no";
  const download = "no";
  const descMatch = "title/alt are concept descriptions, no image to match against";
  const srcType = regEntry?.sourceType ?? "none";
  const genProvider = regEntry?.sourceType?.includes("ai") ? "unknown (no generation record)" : "none";
  const genDate = regEntry?.reviewedAt ?? "none";
  const evidence = regEntry?.licenseEvidence?.slice(0, 60) ?? "none";

  csvRows.push([
    p.id, `"${p.title}"`, p.styleId,
    `wallpaper.${p.id}`,
    files[0] ?? "none",
    sha,
    srcType,
    genProvider,
    genDate,
    `"${evidence}"`,
    display, download,
    `"${descMatch}"`,
    decision,
    `"${missing}"`,
    `"${action}"`,
  ].join(","));

  mdRows.push({
    id: p.id, title: p.title, styleId: p.styleId,
    hasFile, hasRegistry: Boolean(regEntry), hasPreview,
    decision, missing, action,
  });
}

// Write CSV
mkdirSync(path.join(webRoot, "..", "..", "docs", "media-review"), { recursive: true });
const csvPath = path.join(webRoot, "..", "..", "docs", "media-review", "pending-wallpapers-review.csv");
writeFileSync(csvPath, csvRows.join("\n") + "\n");
console.log("CSV written:", csvPath, `(${pending.length} rows)`);

// Stats
console.log("\n=== STATISTICS ===");
console.log("39 pending wallpapers:");
console.log("  with independent image file:", stats.hasFile);
console.log("  with license evidence:", stats.hasEvidence);
console.log("  can display + download:", 0, "(none qualify)");
console.log("  display-only:", 0);
console.log("  should stay isolated:", stats.keepIsolated - stats.regenerate);
console.log("  recommend regenerate:", stats.regenerate);
console.log("  would duplicate style preview if promoted as-is:", stats.duplicate);
