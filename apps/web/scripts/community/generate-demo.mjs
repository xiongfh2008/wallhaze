#!/usr/bin/env node
/**
 * WallHaze Community demo-seed generator (operator-run, auditable).
 *
 * Generates simulated community submissions with real fal.ai calls under a
 * hard budget ledger. This is NOT a user-facing feature:
 *
 * - Real submissions stay in data/community/works.json (human-reviewed).
 * - Demo media lands in public/community-demo/ and the metadata in
 *   data/community/demo-works.json with origin "demo_seed".
 * - Production builds never render demo data (lib/community/demo.ts).
 *
 * Budget safety (per run, enforced BEFORE each paid call):
 * - --max-images / --max-videos caps the number of PAID requests.
 * - --budget-usd caps estimated spend; a call whose estimate cannot be
 *   computed is refused.
 * - A per-run ledger (private-media/community/ledger-<ts>.json) is written
 *   after every request; failures are recorded, never retried automatically.
 * - The script refuses to run when the accumulated ledger already reaches the
 *   cap, and a ledger with an "uncertain" request marks the run poisoned.
 *
 * Usage:
 *   node scripts/community/generate-demo.mjs --dry-run            # plan only
 *   node scripts/community/generate-demo.mjs --only images        # paid
 *   node scripts/community/generate-demo.mjs --only videos        # paid
 *   node scripts/community/generate-demo.mjs --only images --max-images 3
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { isMp4, probeMp4 } from "./mp4.mjs";

const ROOT = process.cwd();
const PLAN_FILE = "demo-plan.json";
const LEDGERS = path.join(ROOT, "private-media", "community", "fal-ledgers");
const PRIVATE_DEMO = path.join(ROOT, "private-media", "community", "demo-media");

const FAL_QUEUE_BASE = "https://queue.fal.run";
const IMAGE_ENDPOINT = "/fal-ai/flux-2/klein/4b";
const IMAGE_PRICE_USD_PER_MEGAPIXEL = 0.005; // official model page, 2026-10-24
const VIDEO_ENDPOINT = "/fal-ai/wan/v2.2-5b/image-to-video";
const VIDEO_PRICE_USD_PER_VIDEO = 0.15; // official model page, 2026-10-24
const VIDEO_MAX_FPS = 24;
const VIDEO_MAX_FRAMES = 161; // adapter limit for ≤5s at 24fps

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : null;
};
const planOption = () => option("plan") ?? PLAN_FILE;
const intOption = (name, fallback) => {
  const raw = option(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return value;
};

const dryRun = flag("dry-run");
const only = option("only") ?? "all";
if (!["all", "images", "videos"].includes(only)) {
  throw new Error("--only must be all|images|videos");
}
const budgetUsd = Number(option("budget-usd") ?? "3.00");
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
  throw new Error("--budget-usd must be a positive number");
}
const maxImages = intOption("max-images", 18);
const maxVideos = intOption("max-videos", 3);

function fail(message) {
  throw new Error(message);
}
function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function loadKey() {
  const key = process.env.FAL_KEY ?? null;
  if (!key || !key.startsWith("fal_")) return null;
  return key;
}
function loadPreviousLedgerSpend() {
  if (!existsSync(LEDGERS)) return { spent: 0, poisoned: false, files: 0 };
  let spent = 0;
  let poisoned = false;
  const files = [];
  for (const name of sortedLedgers()) {
    const entry = readJson(path.join(LEDGERS, name));
    for (const record of entry.requests ?? []) {
      if (record.kind === "uncertain") poisoned = true;
      if (typeof record.estimatedCostUsd === "number") spent += record.estimatedCostUsd;
    }
    files.push(name);
  }
  return { spent, poisoned, files };
}
function sortedLedgers() {
  if (!existsSync(LEDGERS)) return [];
  return readdirSync(LEDGERS)
    .filter((name) => name.endsWith(".json"))
    .sort();
}
function imageCostUsd(width, height, numImages = 1) {
  const megapixels = (width * height) / 1_000_000;
  return Number((megapixels * IMAGE_PRICE_USD_PER_MEGAPIXEL * numImages).toFixed(6));
}
function videoCostUsd() {
  return VIDEO_PRICE_USD_PER_VIDEO;
}

async function falSubmit(key, endpoint, payload) {
  const response = await fetch(`${FAL_QUEUE_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    fail(`fal submit ${endpoint} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return response.json();
}
async function falStatus(key, statusUrl) {
  const response = await fetch(statusUrl, {
    headers: { Authorization: `Key ${key}` },
  });
  if (!response.ok) {
    fail(`fal status failed: HTTP ${response.status}`);
  }
  return response.json();
}
async function falResult(key, responseUrl) {
  const response = await fetch(responseUrl, {
    headers: { Authorization: `Key ${key}` },
  });
  if (!response.ok) {
    fail(`fal result failed: HTTP ${response.status}`);
  }
  return response.json();
}
async function waitForJob(key, statusUrl, { timeoutMs = 240_000, intervalMs = 2_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await falStatus(key, statusUrl);
    if (status.status === "COMPLETED") return status;
    if (status.status === "FAILED" || status.status === "ERROR") {
      fail(`fal job failed: ${JSON.stringify(status).slice(0, 300)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  fail(`fal job timed out after ${timeoutMs}ms: ${statusUrl}`);
}
async function downloadBinary(url, maxBytes) {
  const response = await fetch(url);
  if (!response.ok) fail(`media download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) fail(`media too large: ${url}`);
  return buffer;
}

function estimatePlan() {
  const plan = readJson(path.join(ROOT, "scripts", "community", planOption()));
  const jobs = [];
  let estimatedUsd = 0;
  for (const job of plan.imageJobs ?? []) {
    const cost = imageCostUsd(job.width, job.height, job.numImages ?? 1);
    estimatedUsd += cost;
    jobs.push({ ...job, kind: "image", estimatedCostUsd: cost });
  }
  for (const job of plan.videoJobs ?? []) {
    const cost = videoCostUsd();
    estimatedUsd += cost;
    jobs.push({ ...job, kind: "video", estimatedCostUsd: cost });
  }
  return { plan, jobs, estimatedUsd };
}

async function run() {
  const { jobs, estimatedUsd: fullEstimate } = estimatePlan();
  const wanted = jobs.filter((job) =>
    only === "all"
      ? true
      : only === "images"
        ? job.kind === "image"
        : job.kind === "video"
  );
  const imageJobs = wanted.filter((job) => job.kind === "image").slice(0, maxImages);
  const videoJobs = wanted.filter((job) => job.kind === "video").slice(0, maxVideos);
  const selected = [...imageJobs, ...videoJobs];
  const selectedCost = selected.reduce((sum, job) => sum + job.estimatedCostUsd, 0);

  const previous = loadPreviousLedgerSpend();
  const remaining = Number((budgetUsd - previous.spent).toFixed(6));
  if (previous.poisoned) {
    fail(
      `previous ledger contains an UNCERTAIN request; resolve it manually before spending again (ledgers: ${previous.files.join(", ")})`
    );
  }
  if (selectedCost > remaining + 1e-9) {
    fail(
      `plan cost $${selectedCost.toFixed(4)} exceeds remaining budget $${remaining.toFixed(4)} (spent $${previous.spent.toFixed(4)} of $${budgetUsd.toFixed(2)})`
    );
  }

  const summary = {
    dryRun,
    only,
    budgetUsd,
    previousSpendUsd: Number(previous.spent.toFixed(4)),
    remainingBeforeUsd: remaining,
    selectedJobs: selected.length,
    selectedImages: imageJobs.length,
    selectedVideos: videoJobs.length,
    estimatedCostUsd: Number(selectedCost.toFixed(4)),
    fullPlanEstimateUsd: Number(fullEstimate.toFixed(4)),
    skipped: {
      images: Math.max(0, wanted.filter((j) => j.kind === "image").length - imageJobs.length),
      videos: Math.max(0, wanted.filter((j) => j.kind === "video").length - videoJobs.length),
    },
  };

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, ...summary, jobs: selected.map(({ id, kind, estimatedCostUsd }) => ({ id, kind, estimatedCostUsd })) }, null, 2));
    return;
  }

  const key = loadKey();
  if (!key) {
    fail(
      "FAL_KEY is not available in this shell. Load it manually (e.g. from .env.local) — the script never reads or prints secret values beyond existence."
    );
  }

  mkdirSync(LEDGERS, { recursive: true });
  mkdirSync(path.join(PRIVATE_DEMO, "images"), { recursive: true });
  mkdirSync(path.join(PRIVATE_DEMO, "videos"), { recursive: true });
  mkdirSync(path.join(PRIVATE_DEMO, "posters"), { recursive: true });

  const ledgerPath = path.join(LEDGERS, `ledger-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const ledger = {
    startedAt: new Date().toISOString(),
    budgetUsd,
    previousSpendUsd: Number(previous.spent.toFixed(4)),
    plannedCostUsd: Number(selectedCost.toFixed(6)),
    requests: [],
    outputs: [],
  };

  let spent = previous.spent;
  let completed = 0;
  let failed = 0;

  try {
    for (const job of selected) {
      const remainingNow = Number((budgetUsd - spent).toFixed(6));
      if (job.estimatedCostUsd > remainingNow + 1e-9) {
        ledger.requests.push({
          at: new Date().toISOString(),
          jobId: job.id,
          kind: job.kind,
          skipped: "budget-exhausted",
          estimatedCostUsd: job.estimatedCostUsd,
          remainingBefore: remainingNow,
        });
        failed += 1;
        continue;
      }

      try {
        let output;
        let requestId = null;
        if (job.kind === "image") {
          const payload = {
            prompt: job.prompt,
            image_size: { width: job.width, height: job.height },
            num_images: 1,
            output_format: "jpeg",
            enable_safety_checker: true,
          };
          const submit = await falSubmit(key, IMAGE_ENDPOINT, payload);
          requestId = submit.request_id ?? null;
          await waitForJob(key, submit.status_url);
          const result = await falResult(key, submit.response_url);
          const imageUrl = result?.images?.[0]?.url;
          if (!imageUrl) fail(`image ${job.id}: no image in fal result`);
          const bytes = await downloadBinary(imageUrl, 30 * 1024 * 1024);
          const publicPath = `/community-demo/images/${job.slug}.jpg`;
          const target = path.join(PRIVATE_DEMO, "images", `${job.slug}.jpg`);
          await sharp(bytes)
            .rotate()
            .jpeg({ quality: 90, mozjpeg: true })
            .toFile(target);
          const meta = await sharp(target).metadata();
          output = {
            kind: "image",
            publicPath,
            width: meta.width,
            height: meta.height,
            bytes: statSync(target).size,
          };
          ledger.outputs.push({
            jobId: job.id,
            ...output,
            sourceSha256: sha256(bytes),
            falRequestId: requestId,
            prompt: job.prompt,
          });
        } else {
          const firstFramePath = path.resolve(ROOT, job.firstFrame);
          if (!existsSync(firstFramePath)) fail(`video ${job.id}: missing first frame ${job.firstFrame}`);
          const dataUri = `data:image/jpeg;base64,${readFileSync(firstFramePath).toString("base64")}`;
          const numFrames = Math.min(VIDEO_MAX_FRAMES, Math.round(job.durationSeconds * VIDEO_MAX_FPS));
          const payload = {
            image_url: dataUri,
            prompt: job.prompt,
            negative_prompt: job.negativePrompt ?? "",
            num_frames: numFrames,
            frames_per_second: VIDEO_MAX_FPS,
            resolution: "720p",
            aspect_ratio: job.aspectRatio,
            enable_safety_checker: true,
            video_quality: "high",
          };
          const submit = await falSubmit(key, VIDEO_ENDPOINT, payload);
          requestId = submit.request_id ?? null;
          await waitForJob(key, submit.status_url, { timeoutMs: 600_000 });
          const result = await falResult(key, submit.response_url);
          const videoUrl = result?.video?.url;
          if (!videoUrl) fail(`video ${job.id}: no video in fal result`);
          const bytes = await downloadBinary(videoUrl, 80 * 1024 * 1024);
          if (!isMp4(bytes)) fail(`video ${job.id}: downloaded bytes are not MP4`);
          const publicPath = `/community-demo/videos/${job.slug}.mp4`;
          writeFileSync(path.join(PRIVATE_DEMO, "videos", `${job.slug}.mp4`), bytes);
          const probe = probeMp4(bytes);
          if (!probe.durationSeconds || !probe.width || !probe.height) {
            fail(`video ${job.id}: probe failed ${JSON.stringify(probe)}`);
          }
          const posterSource = path.resolve(ROOT, job.posterSource);
          const posterPublic = `/community-demo/posters/${job.slug}.jpg`;
          await sharp(posterSource)
            .rotate()
            .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 82, mozjpeg: true })
            .toFile(path.join(PRIVATE_DEMO, "posters", `${job.slug}.jpg`));
          output = {
            kind: "video",
            publicPath,
            posterPublicPath: posterPublic,
            width: probe.width,
            height: probe.height,
            durationSeconds: Number(probe.durationSeconds.toFixed(3)),
            bytes: bytes.byteLength,
          };
          ledger.outputs.push({
            jobId: job.id,
            ...output,
            sourceSha256: sha256(bytes),
            falRequestId: requestId,
            prompt: job.prompt,
            firstFrame: job.firstFrame,
          });
        }

        spent = Number((spent + job.estimatedCostUsd).toFixed(6));
        ledger.requests.push({
          at: new Date().toISOString(),
          jobId: job.id,
          kind: job.kind,
          endpoint: job.kind === "image" ? IMAGE_ENDPOINT : VIDEO_ENDPOINT,
          falRequestId: requestId,
          estimatedCostUsd: job.estimatedCostUsd,
          spendAfterUsd: spent,
        });
        completed += 1;
        writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
      } catch (error) {
        failed += 1;
        ledger.requests.push({
          at: new Date().toISOString(),
          jobId: job.id,
          kind: job.kind,
          failed: true,
          falRequestId: null,
          error: String(error.message ?? error).slice(0, 400),
          note:
            "If the request actually reached fal.ai before failing, treat spend as UNCERTAIN and reconcile manually before further paid runs.",
        });
        writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
        // No automatic retry: an ambiguous failure may already have been billed.
      }

      if (spent >= budgetUsd) {
        ledger.stoppedReason = "budget-reached";
        break;
      }
    }
  } finally {
    ledger.finishedAt = new Date().toISOString();
    ledger.totalEstimatedSpendUsd = Number(spent.toFixed(4));
    ledger.remainingBudgetUsd = Number(Math.max(0, budgetUsd - spent).toFixed(4));
    ledger.completed = completed;
    ledger.failed = failed;
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      {
        ok: failed === 0,
        ledger: path.relative(ROOT, ledgerPath).replaceAll("\\", "/"),
        ...summary,
        completed,
        failed,
        spendAfterUsd: Number(spent.toFixed(4)),
        remainingBudgetUsd: Number(Math.max(0, budgetUsd - spent).toFixed(4)),
        outputs: ledger.outputs,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(`[demo-generate] ${error.message}`);
  process.exit(1);
});
