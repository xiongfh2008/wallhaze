#!/usr/bin/env node
/**
 * Local gallery scan (AIGC stage 3, operator-run variant): screens every
 * asset listed in public/gallery-manifest.json through the output
 * moderation service and writes a private JSON report. Complements the
 * API-side scheduled gallery-rescan job — use this for the one-time
 * baseline scan and for spot checks; use the scheduled job for the
 * recurring re-scan (its verdicts land in moderation_logs).
 *
 * Fail closed: refuses to run without OUTPUT_MODERATION_API_KEY; a block
 * verdict is reported per-asset (the takedown itself stays the human
 * community:unpublish / media-rights quarantine CLI action).
 *
 * Run: npm run moderation:scan-gallery
 *      SITE_URL=https://wallhaze.com npm run community:manifest && npm run moderation:scan-gallery
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { screenMediaFile, moderationConfigured } from "./output-moderation.mjs";
import { isolateFlaggedEntry, isolationRoots } from "./moderation-isolate.mjs";

// --isolate: automatically hide flagged community works (file moved to the
// moderation quarantine — bytes preserved, never deleted; works.json status
// flipped to "withdrawn"). Registry-managed assets are recorded for the
// manual media-rights CLI instead. Omitting the flag keeps report-only mode.
const isolate = process.argv.includes("--isolate");

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "public", "gallery-manifest.json");
const REPORT_DIR = path.join(ROOT, "private-media", "moderation");
const REPORT = path.join(REPORT_DIR, `gallery-scan-${new Date().toISOString().slice(0, 10)}.json`);

if (!moderationConfigured()) {
  console.error(
    "[gallery-scan] OUTPUT_MODERATION_API_KEY is required — refusing to produce an unscreened report"
  );
  process.exit(1);
}

const entries = JSON.parse(readFileSync(MANIFEST, "utf8"));
if (!Array.isArray(entries) || entries.length === 0) {
  console.error(`[gallery-scan] no entries in ${path.relative(ROOT, MANIFEST)} — run npm run community:manifest first`);
  process.exit(1);
}

const results = [];
let allow = 0;
let block = 0;
let unavailable = 0;

for (const entry of entries) {
  process.stdout.write(`[gallery-scan] ${entry.id} (${entry.type}) ... `);
  let verdict;
  if (entry.type === "image") {
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      verdict = { action: "unavailable", categories: [], status: response.status };
    } else {
      const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
      const os = await import("node:os");
      const tmp = await mkdtemp(path.join(os.tmpdir(), "gallery-scan-"));
      const file = path.join(tmp, path.basename(new URL(entry.url).pathname) || "asset.bin");
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      verdict = await screenMediaFile(file, "image", {
        mime: response.headers.get("content-type") ?? undefined,
      });
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  } else {
    // Videos are screened from the fetched file so ffmpeg can sample frames.
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
      verdict = { action: "unavailable", categories: [], status: response.status };
    } else {
      const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
      const os = await import("node:os");
      const tmp = await mkdtemp(path.join(os.tmpdir(), "gallery-scan-"));
      const file = path.join(tmp, path.basename(new URL(entry.url).pathname) || "asset.mp4");
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      verdict = await screenMediaFile(file, "video");
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  results.push({ id: entry.id, type: entry.type, url: entry.url, ...verdict, scannedAt: new Date().toISOString() });
  if (verdict.action === "allow") allow += 1;
  else if (verdict.action === "block") block += 1;
  else unavailable += 1;
  console.log(verdict.action, verdict.categories?.length ? `[${verdict.categories.join(",")}]` : "");
}

// Auto-isolation pass (only with --isolate; block verdicts only).
const isolation = [];
if (isolate && block > 0) {
  const roots = isolationRoots(ROOT);
  for (const result of results.filter((r) => r.action === "block")) {
    isolation.push(isolateFlaggedEntry(result, roots, { scannedAt: results[0]?.scannedAt ?? null }));
  }
  console.log(
    `[gallery-scan] isolated ${isolation.filter((i) => i.isolated).length} community work(s); ` +
      `${isolation.filter((i) => !i.isolated).length} registry-owned asset(s) recorded for the manual rights CLI`
  );
}

mkdirSync(REPORT_DIR, { recursive: true });
const tmp = `${REPORT}.tmp`;
writeFileSync(tmp, `${JSON.stringify({ scannedAt: new Date().toISOString(), isolate, isolation, totals: { scanned: entries.length, allow, block, unavailable }, results }, null, 2)}\n`);
renameSync(tmp, REPORT);

console.log(
  `[gallery-scan] done scanned=${entries.length} allow=${allow} block=${block} unavailable=${unavailable} -> ${path.relative(ROOT, REPORT)}`
);
if (block > 0) {
  console.error(
    `[gallery-scan] BLOCKED assets need takedown via community:unpublish / media-rights quarantine CLI: ${results.filter((r) => r.action === "block").map((r) => r.id).join(", ")}`
  );
  process.exit(2);
}
