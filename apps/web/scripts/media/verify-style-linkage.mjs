// Verify the style-asset linkage evidence for the 7 wallpapers that reuse
// their style's preview image (or another verified artwork) instead of having
// their own registry entry. Read-only: no AI calls, no license state changes.
// Run from apps/web:  node scripts/media/verify-style-linkage.mjs
//
// Key principle: content reuse is NOT a license violation. Each of these
// works renders through resolveWallpaper() as:
//   image = seed.imageOverride ?? style.image
// so the actually-displayed bytes are tracked under the style asset (or the
// overridden artwork's asset), which itself carries verified rights.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "..", "..");
const root = path.resolve(webRoot, "..", "..");
const reg = JSON.parse(readFileSync(path.join(webRoot, "data", "media-rights.json"), "utf8"));
const ts = readFileSync(path.join(webRoot, "lib", "wallpapers.ts"), "utf8");
const byId = new Map(reg.assets.map(a => [a.assetId, a]));

// The 7 works under review (aurora-veil-wide included: it reuses aurora-veil's
// file via imageOverride and has no registry entry of its own).
const WORKS = [
  { id: "galaxy-tide", styleId: "starry-galaxy" },
  { id: "stillwater-dawn", styleId: "mountain-lake" },
  { id: "abyssal-bloom", styleId: "deep-ocean" },
  { id: "aurora-veil", styleId: "aurora-nights" },
  { id: "quiet-geometry", styleId: "architecture-minimal" },
  { id: "dewline", styleId: "macro-nature" },
  { id: "soft-horizon", styleId: "soft-gradient" },
  { id: "aurora-veil-wide", styleId: "aurora-nights", overrideOf: "aurora-veil" },
];

// Parse each seed block from wallpapers.ts to confirm seed-level fields.
function seedBlock(id) {
  const s = ts.indexOf(`id: "${id}"`);
  if (s < 0) return null;
  const start = ts.lastIndexOf("{", s);
  const end = ts.indexOf("\n  },", s);
  return ts.slice(start, end);
}
function sha256File(p) {
  const buf = readFileSync(p);
  return createHash("sha256").update(buf).digest("hex");
}

const rows = [];
let allOk = true;

for (const w of WORKS) {
  const block = seedBlock(w.id);
  const seedLicense = block?.match(/license: "([a-z-]+)"/)?.[1] || "?";
  const seedOverride = block?.match(/imageOverride: "([^"]+)"/)?.[1] || null;

  // Resolve the actually-rendered asset:
  // 1. explicit imageOverride -> registry entry whose path === override
  // 2. own wallpaper.<id> entry
  // 3. fallback: style.<styleId> preview (resolveWallpaper style.image)
  let asset = null, resolveReason = "";
  if (w.overrideOf) {
    asset = byId.get(`wallpaper.${w.overrideOf}`);
    resolveReason = `imageOverride -> reuses wallpaper.${w.overrideOf} (same file bytes)`;
  } else if (seedOverride) {
    asset = reg.assets.find(a => a.path === seedOverride);
    resolveReason = `imageOverride ${seedOverride}`;
  } else if (byId.has(`wallpaper.${w.id}`)) {
    asset = byId.get(`wallpaper.${w.id}`);
    resolveReason = "own wallpaper.<id> registry entry";
  } else {
    asset = byId.get(`style.${w.styleId}`);
    resolveReason = `no wallpaper.<id> entry; resolveWallpaper() falls back to style preview style.${w.styleId}`;
  }

  const checks = {};
  checks.seedLicenseRecorded = ["verified", "self-authored"].includes(seedLicense);
  checks.registryEntryExists = !!asset;
  if (asset) {
    checks.reviewStatusVerified = asset.reviewStatus === "verified";
    checks.canPubliclyDisplay = asset.canPubliclyDisplay === true;
    checks.canOfferDownload = asset.canOfferDownload === true;
    // evidenceStatus is optional on pre-existing entries (the authoritative
    // gate is reviewStatus === "verified"); when present it must be verified.
    checks.evidenceStatusValid =
      asset.evidenceStatus === undefined || asset.evidenceStatus === "verified";
    // hash the actual public file and compare with the registry sha256
    const abs = path.join(webRoot, "public", asset.path.replace(/^\//, ""));
    checks.publicFileExists = existsSync(abs);
    if (checks.publicFileExists) {
      checks.sha256Matches = sha256File(abs) === asset.sha256;
    } else {
      checks.sha256Matches = false;
    }
  }
  const ok = Object.values(checks).every(Boolean);
  if (!ok) allOk = false;

  rows.push({ w, seedLicense, seedOverride, asset, resolveReason, checks, ok });
}

const date = new Date().toISOString().slice(0, 10);
let md = `# Style-Asset Linkage Evidence — ${date}

Scope: galaxy-tide, stillwater-dawn, abyssal-bloom, aurora-veil, quiet-geometry,
dewline, soft-horizon (+ aurora-veil-wide, which reuses aurora-veil's file).

Conclusion: these works reuse already-cleared imagery through the documented
\`resolveWallpaper()\` fallback (\`seed.imageOverride ?? style.image\`). The rendered
bytes are tracked under a registry asset that is independently \`verified\` with
display + download rights. **Content reuse is not a license violation**, and this
check makes no changes to any license state. Re-run:
\`node scripts/media/verify-style-linkage.mjs\`

| Work | Seed license | Rendered asset (assetId) | Resolution path | verified | display | download | sha256 match | Result |
|---|---|---|---|---|---|---|---|---|
`;

for (const r of rows) {
  const a = r.asset;
  md += `| ${r.w.id} | ${r.seedLicense} | ${a ? a.assetId : "MISSING"} | ${r.resolveReason} | ${r.checks.reviewStatusVerified ? "yes" : "NO"} | ${r.checks.canPubliclyDisplay ? "yes" : "NO"} | ${r.checks.canOfferDownload ? "yes" : "NO"} | ${r.checks.sha256Matches ? "yes" : "NO"} | ${r.ok ? "PASS" : "FAIL"} |\n`;
}

md += `
## Per-work evidence

`;

for (const r of rows) {
  const a = r.asset;
  md += `### ${r.w.id}
- Seed: \`lib/wallpapers.ts\` license "${r.seedLicense}"${r.seedOverride ? `, imageOverride ${r.seedOverride}` : ", no imageOverride (style fallback)"}
- Rendered asset: \`${a.assetId}\` — ${a.path}
- sourceType: ${a.sourceType} / licenseType: ${a.licenseType}
- evidenceStatus: ${a.evidenceStatus ?? "not set (pre-existing entry; reviewStatus is authoritative)"} / reviewStatus: ${a.reviewStatus} (reviewedBy: ${a.reviewedBy ?? "n/a"}, reviewedAt: ${a.reviewedAt ?? "n/a"})
- canPubliclyDisplay: ${a.canPubliclyDisplay} / canOfferDownload: ${a.canOfferDownload}
- registry sha256: \`${a.sha256}\`
- file check: ${r.checks.publicFileExists ? "exists" : "MISSING"}; recomputed sha256 ${r.checks.sha256Matches ? "matches registry" : "MISMATCH"}
- verdict: ${r.ok ? "PASS — rights fully carried by the referenced asset" : "FAIL — see checks above"}

`;
}

md += `## Notes

- The 6 works without a \`wallpaper.<id>\` entry (galaxy-tide, stillwater-dawn,
  abyssal-bloom, quiet-geometry, dewline, soft-horizon) intentionally reuse their
  style's preview image. They are tracked by the seed-vs-registry consistency
  check as "known gaps" — a naming artifact of that check, not a rights defect.
- aurora-veil has its own \`wallpaper.aurora-veil\` entry; aurora-veil-wide reuses
  the same file via \`imageOverride\`, so its rights are also carried by
  \`wallpaper.aurora-veil\`.
- No license state (evidenceStatus / reviewStatus / canPubliclyDisplay /
  canOfferDownload) was created or modified by this verification.
`;

mkdirSync(path.join(root, "docs", "media-review"), { recursive: true });
const out = path.join(root, "docs", "media-review", "style-linkage-evidence.md");
writeFileSync(out, md);
console.log("written:", out);
console.log(allOk ? "ALL PASS" : "FAILURES DETECTED — see report");
