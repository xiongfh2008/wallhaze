// Batch generation of the remaining 36 review-pending wallpapers.
// Limits (user-approved):
//   - exactly the 36 ids remaining in regeneration-plan.csv
//     (sakura-nights / nebula-city / twilight-peaks are DONE and excluded)
//   - max 36 NEW paid submissions, NO automatic retry of paid requests
//   - overall budget $3.00 INCLUDING the 4 trial-batch requests
//     (3 confirmed in trial-batch3-manifest.json + 1 lost sync call est. $0.0053)
//   - fal Queue API only (guaranteed request_id); sync fal.run is forbidden
//   - unclear submit state => record UNKNOWN, pause that task, NEVER resubmit
//   - persist manifest after every submit and every completion
//   - checkpoint every 6 completed images: counts + cost + file integrity
// Originals go ONLY to private-media/incoming-regeneration/<id>.png.
//
// Run from apps/web:  node scripts/media/gen-remaining-36.mjs

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const PROXY = "http://127.0.0.1:7897"; // verified working for fal domains
const runCurl = promisify(execFile);

const WEB_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");
const OUT_DIR = path.join(WEB_ROOT, "private-media", "incoming-regeneration");
const MANIFEST_PATH = path.join(OUT_DIR, "regen-36-manifest.json");
const CSV_PATH = path.join(REPO_ROOT, "docs", "media-review", "regeneration-plan.csv");
const TRIAL_MANIFEST = path.join(OUT_DIR, "trial-batch3-manifest.json");

const MODEL = "fal-ai/flux-2/klein/4b";
const QUEUE_SUBMIT = "https://queue.fal.run/fal-ai/flux-2/klein/4b";
const PRICE_PER_MEGAPIXEL = 0.005; // official fal.ai model page
const OVERALL_BUDGET_USD = 3.0;    // includes all 4 trial requests
const WORST_CASE_PER_REQUEST = 4.2 * PRICE_PER_MEGAPIXEL;
// trial batch accounting (confirmed + lost sync estimate)
const TRIAL_CONFIRMED_USD = 0.01584;
const TRIAL_LOST_SYNC_EST_USD = 0.0053;
const CHECKPOINT_EVERY = 6;
const DONE_IDS = ["sakura-nights", "nebula-city", "twilight-peaks"];

function loadFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const m = readFileSync(path.join(REPO_ROOT, ".env.local"), "utf8").match(/^FAL_KEY=(.+)\r?$/m);
  return m ? m[1].trim() : null;
}

function parseCsv(text) {
  const lines = text.split("\n").filter(Boolean);
  const header = lines[0].split(",");
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = []; let q = false, c = "";
    for (const ch of line) {
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { cols.push(c); c = ""; continue; }
      c += ch;
    }
    cols.push(c);
    rows.push(Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""])));
  }
  return rows;
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function curlPostJson(key, url, body, timeoutMs) {
  // PAID submit — no retry wrapper by design.
  const tmpBody = path.join(os.tmpdir(), `fal36-body-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const tmpOut = path.join(os.tmpdir(), `fal36-res-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(tmpBody, body);
  try {
    const { stdout } = await runCurl("curl.exe", [
      "-sS", "-x", PROXY, "--max-time", String(Math.ceil(timeoutMs / 1000)),
      "-X", "POST", url,
      "-H", "Content-Type: application/json",
      "-H", `Authorization: Key ${key}`,
      "--data-binary", `@${tmpBody}`,
      "-o", tmpOut, "-w", "%{http_code}",
    ], { timeout: timeoutMs + 15000, maxBuffer: 16 * 1024 * 1024 });
    return { status: parseInt(stdout.trim(), 10), text: existsSync(tmpOut) ? readFileSync(tmpOut, "utf8") : "" };
  } finally {
    try { existsSync(tmpBody) && unlinkSync(tmpBody); } catch {}
    try { existsSync(tmpOut) && unlinkSync(tmpOut); } catch {}
  }
}

async function curlGetJson(key, url, timeoutMs) {
  // free call (status / response polling) — transient proxy/TLS failures may
  // be retried; paid submits never are.
  const tmpOut = path.join(os.tmpdir(), `fal36-get-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { stdout } = await runCurl("curl.exe", [
        "-sS", "-L", "-x", PROXY, "--max-time", String(Math.ceil(timeoutMs / 1000)),
        url, "-H", `Authorization: Key ${key}`,
        "-o", tmpOut, "-w", "%{http_code}",
      ], { timeout: timeoutMs + 15000, maxBuffer: 16 * 1024 * 1024 });
      return { status: parseInt(stdout.trim(), 10), text: existsSync(tmpOut) ? readFileSync(tmpOut, "utf8") : "" };
    } catch (error) {
      lastError = error;
      await new Promise(r => setTimeout(r, 2000));
    } finally {
      try { existsSync(tmpOut) && unlinkSync(tmpOut); } catch {}
    }
  }
  throw lastError;
}

async function pollQueueResult(key, submit, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const st = await curlGetJson(key, submit.status_url, 30_000);
    if (st.status !== 200) return { ok: false, errorKind: "poll-error", errorDetail: `status poll HTTP ${st.status}` };
    let sj;
    try { sj = JSON.parse(st.text); } catch { continue; }
    lastStatus = sj.status;
    if (sj.status === "COMPLETED") {
      const res = await curlGetJson(key, submit.response_url, 60_000);
      if (res.status !== 200) return { ok: false, errorKind: "poll-error", errorDetail: `response_url HTTP ${res.status}` };
      try {
        return { ok: true, payload: JSON.parse(res.text) };
      } catch {
        // proxy occasionally truncates the response body; the image URL is
        // all we strictly need (prompt/seed come from the CSV)
        const m = res.text.match(/"url":"([^"]+)"/);
        if (!m) return { ok: false, errorKind: "poll-error", errorDetail: `response unparseable, no url: ${res.text.slice(0, 120)}` };
        return { ok: true, payload: { images: [{ url: m[1] }], seed: undefined } };
      }
    }
    if (sj.status === "FAILED" || sj.status === "ERROR") {
      return { ok: false, errorKind: "generation-failed", errorDetail: st.text.slice(0, 300) };
    }
  }
  return { ok: false, errorKind: "timeout", errorDetail: `queue poll timed out after ${timeoutMs / 1000}s (last status: ${lastStatus})` };
}

function saveManifest(manifest) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function checkpoint(manifest, registryHashes) {
  const ok = manifest.results.filter(r => r.generationStatus === "completed");
  const failed = manifest.results.filter(r => r.generationStatus === "failed");
  const unknown = manifest.results.filter(r => r.generationStatus === "unknown");
  const batchCost = ok.reduce((a, r) => a + (r.actualCost ?? 0), 0);
  const accounted = TRIAL_CONFIRMED_USD + TRIAL_LOST_SYNC_EST_USD + batchCost;
  // file integrity: re-hash every saved png against its recorded sha256
  let integrityOk = 0, integrityBad = [];
  for (const r of ok) {
    const f = path.join(OUT_DIR, `${r.wallpaperId}.png`);
    if (!existsSync(f)) { integrityBad.push(`${r.wallpaperId}:missing`); continue; }
    if (sha256(readFileSync(f)) !== r.sha256) integrityBad.push(`${r.wallpaperId}:hash-drift`);
    else integrityOk++;
  }
  console.log(`[checkpoint] completed=${ok.length} failed=${failed.length} unknown=${unknown.length} | batch $${batchCost.toFixed(5)} | accounted $${accounted.toFixed(4)}/$${OVERALL_BUDGET_USD} | files ok=${integrityOk} bad=${integrityBad.length ? integrityBad.join(",") : "none"}`);
  return { accounted };
}

async function main() {
  console.log("[batch36] http-layer: curl.exe + proxy, queue API only");
  const key = loadFalKey();
  if (!key) { console.error("[batch36] FAL_KEY not found — refusing to run"); process.exit(1); }

  mkdirSync(OUT_DIR, { recursive: true });
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const reg = JSON.parse(readFileSync(path.join(WEB_ROOT, "data", "media-rights.json"), "utf8"));
  const registryHashes = new Set(reg.assets.map(a => a.sha256).filter(Boolean));

  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
    : {
        model: MODEL, pricePerMegapixelUsd: PRICE_PER_MEGAPIXEL, overallBudgetUsd: OVERALL_BUDGET_USD,
        trialAccounting: { confirmedUsd: TRIAL_CONFIRMED_USD, lostSyncEstUsd: TRIAL_LOST_SYNC_EST_USD },
        results: [], events: [], stoppedReason: null,
      };
  const byId = new Map(manifest.results.map(r => [r.wallpaperId, r]));

  const specs = rows
    .filter(r => !DONE_IDS.includes(r.id))
    .filter(r => {
      const prior = byId.get(r.id);
      // idempotency: skip anything already recorded as submitted/completed/
      // unknown (paused, never resubmitted) or with an existing PNG
      if (prior && ["submitted", "completed", "unknown"].includes(prior.generationStatus)) {
        console.log(`[batch36] skip ${r.id} (already ${prior.generationStatus})`);
        return false;
      }
      if (existsSync(path.join(OUT_DIR, `${r.id}.png`))) {
        console.log(`[batch36] skip ${r.id} (png exists — duplicate-payment guard)`);
        return false;
      }
      return true;
    })
    .map(r => ({
      id: r.id, title: r.title, styleId: r.styleId, prompt: r.prompt,
      w: parseInt(r.targetWidth), h: parseInt(r.targetHeight), seed: parseInt(r.seed),
    }));

  const unknownIds = manifest.results.filter(r => r.generationStatus === "unknown").map(r => r.wallpaperId);
  if (unknownIds.length) console.log(`[batch36] UNKNOWN tasks paused (not resubmitted): ${unknownIds.join(", ")}`);
  console.log(`[batch36] to generate: ${specs.length}`);

  let completedSinceCheckpoint = 0;

  for (const spec of specs) {
    const accounted = TRIAL_CONFIRMED_USD + TRIAL_LOST_SYNC_EST_USD
      + manifest.results.filter(r => r.generationStatus === "completed").reduce((a, r) => a + (r.actualCost ?? 0), 0);
    if (accounted + WORST_CASE_PER_REQUEST > OVERALL_BUDGET_USD) {
      manifest.stoppedReason = `budget guard: accounted $${accounted.toFixed(4)} + worst-case $${WORST_CASE_PER_REQUEST.toFixed(4)} exceeds $${OVERALL_BUDGET_USD}`;
      console.log(`[batch36] STOP: ${manifest.stoppedReason}`);
      break;
    }
    if (manifest.stoppedReason) break;

    const startedAt = new Date().toISOString();
    const record = {
      wallpaperId: spec.id, title: spec.title, styleId: spec.styleId, prompt: spec.prompt,
      seed: spec.seed, model: MODEL, requestId: null, createdAt: startedAt,
      actualWidth: null, actualHeight: null, bytes: null, sha256: null,
      estimatedCost: +(((spec.w * spec.h) / 1e6) * PRICE_PER_MEGAPIXEL).toFixed(5),
      actualCost: null, generationStatus: "pending",
    };
    manifest.results.push(record);

    // ---- PAID submit (no retry) ----
    let submit = null;
    try {
      const { status, text } = await curlPostJson(key, QUEUE_SUBMIT, JSON.stringify({
        prompt: spec.prompt,
        image_size: { width: spec.w, height: spec.h },
        num_images: 1,
        enable_safety_checker: true,
        output_format: "png",
        seed: spec.seed,
      }), 60_000);
      if (status < 200 || status >= 300) {
        record.generationStatus = "failed";
        record.failureDetail = `HTTP ${status}: ${text.slice(0, 200)}`;
        manifest.events.push({ id: spec.id, at: startedAt, kind: "http-error", status, body: text.slice(0, 300) });
        console.log(`[batch36] FAILED ${spec.id}: HTTP ${status} (clear rejection, no task created)`);
        saveManifest(manifest);
        continue;
      }
      submit = JSON.parse(text);
      if (!submit.request_id || !submit.status_url) {
        record.generationStatus = "unknown";
        record.submitResponse = JSON.stringify(submit).slice(0, 500);
        manifest.events.push({ id: spec.id, at: startedAt, kind: "unknown-state", detail: "2xx without request_id — task paused, not resubmitted" });
        console.log(`[batch36] UNKNOWN ${spec.id}: 2xx without request_id — paused`);
        saveManifest(manifest);
        continue;
      }
    } catch (error) {
      record.generationStatus = "unknown";
      record.failureDetail = String(error.message || error).slice(0, 200);
      manifest.events.push({ id: spec.id, at: startedAt, kind: "unknown-state", detail: `submit transport error (state unclear, not resubmitted): ${record.failureDetail}` });
      console.log(`[batch36] UNKNOWN ${spec.id}: submit transport error — paused`);
      saveManifest(manifest);
      continue;
    }

    record.requestId = submit.request_id;
    record.generationStatus = "submitted";
    manifest.events.push({ id: spec.id, at: startedAt, kind: "submitted", requestId: submit.request_id });
    saveManifest(manifest); // persist requestId immediately after submit
    console.log(`[batch36] submitted ${spec.id} requestId=${submit.request_id}`);

    // ---- poll (free) ----
    const poll = await pollQueueResult(key, submit, 150_000);
    if (!poll.ok) {
      record.generationStatus = poll.errorKind === "timeout" ? "unknown" : poll.errorKind === "generation-failed" ? "failed" : "unknown";
      record.failureDetail = poll.errorDetail;
      manifest.events.push({ id: spec.id, at: new Date().toISOString(), kind: poll.errorKind, requestId: submit.request_id, detail: poll.errorDetail });
      console.log(`[batch36] ${poll.errorKind.toUpperCase()} ${spec.id}: ${poll.errorDetail}`);
      saveManifest(manifest);
      continue;
    }

    // ---- download + verify ----
    const image = poll.payload?.images?.[0];
    if (!image?.url) {
      record.generationStatus = "unknown";
      record.failureDetail = "completed but no image url";
      manifest.events.push({ id: spec.id, at: new Date().toISOString(), kind: "response-anomaly", requestId: submit.request_id, detail: JSON.stringify(poll.payload).slice(0, 300) });
      saveManifest(manifest);
      continue;
    }
    const tmpImg = path.join(OUT_DIR, `${spec.id}.png.part`);
    // free download — transient TLS failures via the proxy may be retried
    let dlError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await runCurl("curl.exe", ["-sS", "-L", "-x", PROXY, "--max-time", "120", "-o", tmpImg, image.url], { timeout: 135_000, maxBuffer: 32 * 1024 * 1024 });
        dlError = null;
        break;
      } catch (error) {
        dlError = error;
        await new Promise(r2 => setTimeout(r2, 3000));
      }
    }
    if (dlError) {
      record.generationStatus = "unknown";
      record.failureDetail = `image download failed after 3 attempts (paid request ${submit.request_id} completed; recover via queue response_url): ${String(dlError.message).slice(0, 120)}`;
      manifest.events.push({ id: spec.id, at: new Date().toISOString(), kind: "download-error", requestId: submit.request_id, detail: record.failureDetail });
      console.log(`[batch36] UNKNOWN ${spec.id}: download failed — recoverable via requestId`);
      saveManifest(manifest);
      continue;
    }
    const imageBuf = readFileSync(tmpImg);
    unlinkSync(tmpImg);
    writeFileSync(path.join(OUT_DIR, `${spec.id}.png`), imageBuf);

    const metadata = await sharp(imageBuf).metadata();
    const stats = await sharp(imageBuf).stats();
    const minChannelStd = Math.min(...stats.channels.map(c => c.stdev));
    record.generationStatus = "completed";
    record.requestId = submit.request_id;
    record.seed = poll.payload.seed ?? spec.seed;
    record.createdAt = startedAt;
    record.actualWidth = metadata.width;
    record.actualHeight = metadata.height;
    record.bytes = imageBuf.length;
    record.sha256 = sha256(imageBuf);
    record.actualCost = +(((metadata.width * metadata.height) / 1e6) * PRICE_PER_MEGAPIXEL).toFixed(5);
    record.falResponseUrl = image.url;
    record.safetyChecker = true;
    record.checks = {
      decoded: true,
      dimensionsMatch: Math.abs(metadata.width - spec.w) <= spec.w * 0.02 && Math.abs(metadata.height - spec.h) <= spec.h * 0.02,
      fileSizeSane: imageBuf.length > 50_000,
      notBlank: minChannelStd > 10,
      channelStddevMin: +minChannelStd.toFixed(2),
    };
    manifest.events.push({ id: spec.id, at: new Date().toISOString(), kind: "ok", requestId: submit.request_id, costUsd: record.actualCost });
    saveManifest(manifest);
    console.log(`[batch36] ok ${spec.id}: ${metadata.width}x${metadata.height}, ${(imageBuf.length / 1024).toFixed(0)} KB, $${record.actualCost}`);

    completedSinceCheckpoint++;
    if (completedSinceCheckpoint >= CHECKPOINT_EVERY) {
      completedSinceCheckpoint = 0;
      checkpoint(manifest, registryHashes);
    }
  }

  // final dedupe pass: among batch + against registered assets
  const seen = new Map();
  for (const r of manifest.results) {
    r.duplicateOf = null;
    r.matchesRegisteredAsset = null;
    if (r.generationStatus !== "completed" || !r.sha256) continue;
    if (seen.has(r.sha256)) r.duplicateOf = seen.get(r.sha256);
    else seen.set(r.sha256, r.wallpaperId);
    r.matchesRegisteredAsset = registryHashes.has(r.sha256);
  }

  manifest.requestCount = manifest.results.filter(r => ["submitted", "completed"].includes(r.generationStatus)).length;
  manifest.totalActualCostUsd = +manifest.results.filter(r => r.generationStatus === "completed").reduce((a, r) => a + r.actualCost, 0).toFixed(5);
  manifest.generatedAt = new Date().toISOString();
  saveManifest(manifest);
  console.log(`[batch36] done: submitted=${manifest.requestCount} completed=${manifest.results.filter(r => r.generationStatus === "completed").length} failed=${manifest.results.filter(r => r.generationStatus === "failed").length} unknown=${manifest.results.filter(r => r.generationStatus === "unknown").length} | batch cost $${manifest.totalActualCostUsd}${manifest.stoppedReason ? ` | stopped: ${manifest.stoppedReason}` : ""}`);
  checkpoint(manifest, registryHashes);
}

main().catch((error) => {
  console.error(`[batch36] fatal: ${error.message}`);
  process.exit(1);
});
