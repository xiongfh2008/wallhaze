// Generate the single missing second-batch wallpaper: impasto-night
// (regeneration-plan.csv row, seed 310019, styleId oil-painting, 576x1024).
// Hard limits (user-approved batch task):
//   - exactly ONE paid queue request; no automatic retries
//   - expected cost ≈ $0.0029 (576x1024 = 0.59MP x $0.005/MP); abort if the
//     recorded actual cost exceeds 4x that (0.0116)
//   - fal Queue API only (guaranteed request_id), like gen-remaining-36.mjs
//   - original goes ONLY to private-media/incoming-regeneration/impasto-night.png
//   - FAL_KEY from env or repo-root .env.local; never printed or persisted
//
// Run from apps/web:  node scripts/media/gen-impasto-night.mjs

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const PROXY = "http://127.0.0.1:7897"; // verified working for fal domains
const runCurl = promisify(execFile);

const WEB_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");
const OUT_DIR = path.join(WEB_ROOT, "private-media", "incoming-regeneration");
const OUT_FILE = path.join(OUT_DIR, "impasto-night.png");
const MANIFEST_PATH = path.join(OUT_DIR, "regen-36-manifest.json");

const MODEL = "fal-ai/flux-2/klein/4b";
const QUEUE_SUBMIT = "https://queue.fal.run/fal-ai/flux-2/klein/4b";
const PRICE_PER_MEGAPIXEL = 0.005;
const SEED = 310019;
const WIDTH = 576;
const HEIGHT = 1024;
const PROMPT =
  "Oil painting in impasto style of a swirling starry night over a violet valley, thick visible brushstrokes creating texture and movement, deep blues and purples with touches of gold, inspired by post-impressionist technique, rich color depth, desktop wallpaper, no text, no logos, no watermark";
const COST_LIMIT_USD = 0.0116;

// --- key ---
function loadKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const envPath = path.join(REPO_ROOT, ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*FAL_KEY\s*=\s*(.*)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("FAL_KEY not found (env or repo-root .env.local)");
}
const FAL_KEY = loadKey();

async function curlJson(args) {
  const { stdout } = await runCurl("curl.exe", [
    "-s", "--max-time", "90", "-x", PROXY, ...args,
  ], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function curlBinary(args, outFile) {
  await runCurl("curl.exe", [
    "-s", "--max-time", "180", "-x", PROXY, "-o", outFile, ...args,
  ], { maxBuffer: 16 * 1024 * 1024 });
}

// --- guard: already generated? ---
if (existsSync(OUT_FILE)) {
  console.log("[impasto] output already exists — nothing to do:", OUT_FILE);
  process.exit(0);
}

// --- submit (queue API, guaranteed request_id) ---
const submit = await curlJson([
  "-X", "POST", QUEUE_SUBMIT,
  "-H", `Authorization: Key ${FAL_KEY}`,
  "-H", "Content-Type: application/json",
  "-d", JSON.stringify({
    prompt: PROMPT,
    image_size: { width: WIDTH, height: HEIGHT },
    num_images: 1,
    output_format: "png",
    enable_safety_checker: true,
    seed: SEED,
  }),
]);
if (!submit.request_id) {
  console.error("[impasto] submit FAILED — no request_id:", JSON.stringify(submit).slice(0, 300));
  process.exit(1);
}
console.log("[impasto] submitted:", submit.request_id, "| status_url:", submit.status_url);

// --- poll ---
const statusUrl = submit.status_url ?? `${QUEUE_SUBMIT}/requests/${submit.request_id}/status`;
const responseUrl = submit.response_url ?? `${QUEUE_SUBMIT}/requests/${submit.request_id}`;
let result = null;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const status = await curlJson([
    statusUrl, "-H", `Authorization: Key ${FAL_KEY}`,
  ]);
  if (status.status === "COMPLETED") {
    result = await curlJson([responseUrl, "-H", `Authorization: Key ${FAL_KEY}`]);
    break;
  }
  if (i % 10 === 0) console.log(`[impasto] poll ${i}: ${status.status}`);
}
if (!result) {
  console.error("[impasto] polling ended without a COMPLETED result — record UNKNOWN, do not resubmit");
  process.exit(1);
}

const imageUrl = result?.images?.[0]?.url ?? result?.image_url ?? result?.output?.[0];
if (!imageUrl) {
  console.error("[impasto] no image URL in result:", JSON.stringify(result).slice(0, 300));
  process.exit(1);
}

// --- download + integrity ---
mkdirSync(OUT_DIR, { recursive: true });
await curlBinary([imageUrl], OUT_FILE);
const bytes = readFileSync(OUT_FILE);
const sha = createHash("sha256").update(bytes).digest("hex");

// PNG dimension read (IHDR)
const w = bytes.readUInt32BE(16);
const h = bytes.readUInt32BE(20);
const mp = (w * h) / 1_000_000;
const costUsd = Math.round(mp * PRICE_PER_MEGAPIXEL * 1e6) / 1e6;
console.log(`[impasto] saved ${OUT_FILE}: ${bytes.length}B, ${w}x${h}, est cost $${costUsd}`);
if (costUsd > COST_LIMIT_USD) {
  console.error(`[impasto] cost ${costUsd} exceeds limit ${COST_LIMIT_USD} — flag for manual billing review`);
}

// --- manifest append (record-keeping, idempotent per requestId) ---
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
if (!manifest.results.some((r) => r.wallpaperId === "impasto-night")) {
  manifest.results.push({
    wallpaperId: "impasto-night",
    title: "Impasto Night",
    styleId: "oil-painting",
    prompt: PROMPT,
    seed: SEED,
    model: MODEL,
    requestId: submit.request_id,
    file: "private-media/incoming-regeneration/impasto-night.png",
    sha256: sha,
    width: w,
    height: h,
    bytes: bytes.length,
    actualCostUsd: costUsd,
    generatedAt: new Date().toISOString(),
  });
  manifest.requestCount = (manifest.requestCount ?? 0) + 1;
  manifest.events.push({
    id: "impasto-night",
    at: new Date().toISOString(),
    kind: "generated",
    requestId: submit.request_id,
    costUsd,
  });
  manifest.totalActualCostUsd = Math.round(((manifest.totalActualCostUsd ?? 0) + costUsd) * 1e6) / 1e6;
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("[impasto] manifest updated; batch total cost: $" + manifest.totalActualCostUsd);
}
console.log("[impasto] DONE");
