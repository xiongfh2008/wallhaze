/**
 * One-time (re-runnable) quarantine for legacy style previews with no
 * per-file licence evidence. Files are MOVED, never deleted:
 *
 *   apps/web/public/images/styles/<name>.jpg
 *     -> apps/web/private-media/review-pending/styles/<name>.jpg
 *
 * The Next.js server only serves `public/`, so the original URL stops
 * returning bytes as soon as the move is applied and the app is rebuilt.
 * `manifest.json` keeps the original path, hash, size and restore target.
 *
 * Usage:
 *   node scripts/media/quarantine-pending.mjs           # dry run
 *   node scripts/media/quarantine-pending.mjs --apply   # move files
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public", "images", "styles");
const PRIVATE_DIR = join(ROOT, "private-media", "review-pending", "styles");
const MANIFEST = join(ROOT, "private-media", "review-pending", "manifest.json");

// Keep in sync with PUBLIC_STYLE_IMAGE_IDS in lib/styles.ts.
const PUBLIC_STYLE_IMAGES = new Set([
  "starry-galaxy",
  "mountain-lake",
  "deep-ocean",
  "aurora-nights",
  "architecture-minimal",
  "macro-nature",
  "soft-gradient",
  "abstract-light",
]);

const apply = process.argv.includes("--apply");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (!existsSync(PUBLIC_DIR)) {
  console.error(`[quarantine] missing ${PUBLIC_DIR}`);
  process.exit(1);
}

mkdirSync(PRIVATE_DIR, { recursive: true });

const candidates = readdirSync(PUBLIC_DIR)
  .filter((name) => name.endsWith(".jpg"))
  .filter((name) => !PUBLIC_STYLE_IMAGES.has(name.replace(/\.jpg$/, "")))
  .sort();

const moved = [];
const already = [];
const conflicts = [];

for (const name of candidates) {
  const source = join(PUBLIC_DIR, name);
  const destination = join(PRIVATE_DIR, name);
  const bytes = readFileSync(source);
  const hash = sha256(bytes);
  const size = statSync(source).size;

  if (existsSync(destination)) {
    const existing = sha256(readFileSync(destination));
    if (existing === hash) {
      already.push({ name, hash, size });
      continue;
    }
    conflicts.push({ name, sourceHash: hash, existingHash: existing });
    continue;
  }

  if (apply) renameSync(source, destination);
  moved.push({
    name,
    originalPublicPath: `/images/styles/${name}`,
    privatePath: relative(ROOT, destination).replaceAll("\\", "/"),
    sha256: hash,
    bytes: size,
    movedAt: new Date().toISOString(),
    reviewStatus: "pending",
    reason:
      "No per-file licence evidence for this legacy style preview; withheld from public delivery pending human review.",
  });
}

if (conflicts.length > 0) {
  console.error("[quarantine] refusing to overwrite conflicting files:");
  for (const conflict of conflicts) console.error(conflict);
  process.exit(1);
}

if (apply) {
  const existing = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8"))
    : { version: 1, assets: [] };
  const byName = new Map(existing.assets.map((asset) => [asset.name, asset]));
  for (const entry of moved) byName.set(entry.name, entry);
  for (const entry of already) {
    if (!byName.has(entry.name)) {
      byName.set(entry.name, {
        name: entry.name,
        originalPublicPath: `/images/styles/${entry.name}`,
        privatePath: `private-media/review-pending/styles/${entry.name}`,
        sha256: entry.hash,
        bytes: entry.size,
        movedAt: new Date().toISOString(),
        reviewStatus: "pending",
        reason: "Already quarantined with matching hash.",
      });
    }
  }
  writeFileSync(
    MANIFEST,
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        policy:
          "Review-pending files are moved out of public/. They are never served by Next.js until a human reviewer records a verified decision and restores them.",
        restore:
          "Use scripts/media/restore-asset.mjs --asset <id> --reviewer <name> --decision verified --reason <text> after recording evidence.",
        assets: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
      },
      null,
      2
    )}\n`
  );
}

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      candidates: candidates.length,
      moved: moved.length,
      alreadyQuarantined: already.length,
      conflicts: conflicts.length,
      manifest: apply ? relative(ROOT, MANIFEST).replaceAll("\\", "/") : null,
    },
    null,
    2
  )
);
