#!/usr/bin/env node
/**
 * Manual withdrawal for a published Community submission.
 *
 * It removes the work from the public works.json, moves every public
 * /community/ asset into private-media/community/withdrawn/<slug>/, preserves
 * the private review record and appends an audit entry. It never deletes a
 * file and never touches platform showcase assets.
 *
 * Usage:
 *   node scripts/community/unpublish.mjs --slug my-work \
 *     --reviewer alice --reason "rights complaint #123"
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WORKS = path.join(ROOT, "data", "community", "works.json");
const PRIVATE = path.join(ROOT, "private-media", "community");
const REVIEWS = path.join(PRIVATE, "reviews");
const WITHDRAWN = path.join(PRIVATE, "withdrawn");
const AUDIT = path.join(PRIVATE, "audit-log.jsonl");

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : null;
};
const slug = option("slug");
const reviewer = option("reviewer");
const reason = option("reason");
const dryRun = args.includes("--dry-run");

function fail(message) {
  throw new Error(message);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
function writeJson(file, value) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}

try {
  assert(slug, "--slug is required");
  assert(reviewer, "--reviewer is required");
  assert(reason, "--reason is required");
  const data = readJson(WORKS);
  const work = data.works.find((item) => item.slug === slug);
  assert(work, `unknown work: ${slug}`);
  assert(
    work.origin === "submission",
    "platform showcase works are controlled by code, not the submission withdraw tool"
  );
  assert(work.status === "published", `work is not published: ${work.status}`);

  const publicPaths = [
    work.previewAsset,
    work.posterAsset,
    work.downloadAsset,
  ].filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);

  for (const asset of publicPaths) {
    assert(
      typeof asset === "string" && asset.startsWith("/community/"),
      `refusing to move a non-community asset: ${asset}`
    );
    for (const other of data.works) {
      if (other.slug === slug) continue;
      const used = [other.previewAsset, other.posterAsset, other.downloadAsset];
      assert(
        !used.includes(asset),
        `asset is shared with another work: ${asset}`
      );
    }
  }

  const destinationDir = path.join(WITHDRAWN, slug);
  const moves = publicPaths.map((asset) => {
    const source = path.join(ROOT, "public", asset.replace(/^\//, ""));
    assert(existsSync(source), `missing public asset: ${asset}`);
    const relativeAsset = asset.replace(/^\/community\//, "");
    const destination = path.join(destinationDir, relativeAsset);
    assert(!existsSync(destination), `withdrawal destination exists: ${destination}`);
    return { asset, source, destination };
  });

  const summary = {
    slug,
    reviewer,
    reason,
    status: "withdrawn",
    publicPaths,
    dryRun,
  };

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
    process.exit(0);
  }

  mkdirSync(destinationDir, { recursive: true });
  for (const move of moves) {
    mkdirSync(path.dirname(move.destination), { recursive: true });
    renameSync(move.source, move.destination);
  }

  data.works = data.works.filter((item) => item.slug !== slug);
  writeJson(WORKS, data);

  const reviewPath = path.join(REVIEWS, `${slug}.json`);
  const review = existsSync(reviewPath) ? readJson(reviewPath) : {};
  writeJson(reviewPath, {
    ...review,
    status: "withdrawn",
    withdrawnAt: new Date().toISOString(),
    withdrawnBy: reviewer,
    withdrawalReason: reason,
    movedAssets: moves.map((move) => ({
      from: move.asset,
      to: path.relative(ROOT, move.destination).replaceAll("\\", "/"),
    })),
  });

  mkdirSync(path.dirname(AUDIT), { recursive: true });
  appendFileSync(
    AUDIT,
    `${JSON.stringify({
      at: new Date().toISOString(),
      action: "withdraw",
      slug,
      reviewer,
      reason,
      movedAssets: moves.map((move) => move.asset),
    })}\n`
  );

  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
} catch (error) {
  console.error(`[community-unpublish] ${error.message}`);
  process.exit(1);
}
