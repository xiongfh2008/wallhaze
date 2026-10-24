#!/usr/bin/env node
/**
 * Read-only integrity check for the media rights registry.
 *
 * Fails when a pending/restricted file is reachable from public/, when a
 * cleared public file is missing or has drifted, or when an unregistered
 * image exists in the gallery/style directories.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const registry = JSON.parse(
  readFileSync(join(ROOT, "data", "media-rights.json"), "utf8")
);
const errors = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(ROOT, path).replaceAll("\\", "/");

for (const asset of registry.assets) {
  if (asset.publiclyAccessible) {
    if (!asset.path.startsWith("/")) errors.push(`${asset.assetId}: public path is not absolute`);
    const file = join(ROOT, "public", asset.path.replace(/^\//, ""));
    if (!existsSync(file)) {
      errors.push(`${asset.assetId}: public file missing (${asset.path})`);
      continue;
    }
    const bytes = readFileSync(file);
    if (asset.sha256 && hash(bytes) !== asset.sha256) {
      errors.push(`${asset.assetId}: public hash drift`);
    }
    if (asset.reviewStatus !== "verified") {
      errors.push(`${asset.assetId}: non-verified asset is public`);
    }
    if (!asset.canPubliclyDisplay) {
      errors.push(`${asset.assetId}: public file with canPubliclyDisplay=false`);
    }
  } else if (asset.privatePath) {
    const file = join(ROOT, asset.privatePath);
    if (!existsSync(file)) {
      errors.push(`${asset.assetId}: private file missing (${asset.privatePath})`);
      continue;
    }
    const bytes = readFileSync(file);
    if (asset.sha256 && hash(bytes) !== asset.sha256) {
      errors.push(`${asset.assetId}: private hash drift`);
    }
    if (asset.canPubliclyDisplay || asset.canOfferDownload) {
      errors.push(`${asset.assetId}: private asset still marked display/download`);
    }
  }
}

const registeredPublic = new Set(
  registry.assets
    .filter((asset) => asset.publiclyAccessible)
    .map((asset) => asset.path)
);
for (const dir of ["styles", "wallpapers"]) {
  const absolute = join(ROOT, "public", "images", dir);
  for (const name of readdirSync(absolute).filter((f) => f.endsWith(".jpg"))) {
    const publicPath = `/images/${dir}/${name}`;
    if (!registeredPublic.has(publicPath)) {
      errors.push(`unregistered public image: ${publicPath}`);
    }
  }
}

const registeredPrivate = new Set(
  registry.assets
    .filter((asset) => asset.privatePath)
    .map((asset) => asset.privatePath)
);
for (const name of readdirSync(
  join(ROOT, "private-media", "review-pending", "styles")
).filter((f) => f.endsWith(".jpg"))) {
  const privatePath = rel(
    join(ROOT, "private-media", "review-pending", "styles", name)
  );
  if (!registeredPrivate.has(privatePath)) {
    errors.push(`unregistered quarantined image: ${privatePath}`);
  }
}

if (errors.length > 0) {
  console.error(`[rights] ${errors.length} failure(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      assets: registry.assets.length,
      public: registry.assets.filter((a) => a.publiclyAccessible).length,
      private: registry.assets.filter((a) => a.privatePath).length,
      pending: registry.assets.filter((a) => a.reviewStatus === "pending").length,
      restricted: registry.assets.filter((a) => a.reviewStatus === "restricted").length,
    },
    null,
    2
  )
);
