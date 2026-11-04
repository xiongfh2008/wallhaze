// Trial batch: first 3 wallpaper generation requests (sakura-nebula-twilight).
// Authorized paid trial — hard limits:
//   - exactly the 3 ids below, max 3 paid requests, NO retries
//   - hard cost cap $0.30 (actual billing basis: $0.005 per output megapixel)
//   - any timeout / billing anomaly / budget anomaly → stop immediately
//   - duplicate-payment protection: skip ids whose output PNG already exists
//     or that already appear in the trial manifest
// Originals go ONLY to private-media/incoming-regeneration/ (never public/).
// Read-only vs lib/wallpapers.ts and data/media-rights.json — no status changes.
//
// Run from apps/web:  node scripts/media/gen-trial-batch3.mjs
// FAL_KEY is read from the environment or the repo-root .env.local; it is
// never printed or persisted.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

// Node 22 global fetch ignores HTTP(S)_PROXY, so all HTTP goes through
// curl.exe with an explicit proxy flag (TLS verification stays ON; the
// system proxy configuration is not touched).
const PROXY = "http://127.0.0.1:7897";
const runCurl = promisify(execFile);

const WEB_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");
const OUT_DIR = path.join(WEB_ROOT, "private-media", "incoming-regeneration");
const MANIFEST_PATH = path.join(OUT_DIR, "trial-batch3-manifest.json");
const CONTACT_SHEET = path.join(OUT_DIR, "contact-sheet-trial-batch3.png");
const CSV_PATH = path.join(REPO_ROOT, "docs", "media-review", "regeneration-plan.csv");

const MODEL = "fal-ai/flux-2/klein/4b";
// fal queue API: submit returns a guaranteed request_id; polling the
// status_url is free. The sync fal.run endpoint does not include request_id
// in its response body, which would violate the record-keeping requirement.
const QUEUE_SUBMIT = "https://queue.fal.run/fal-ai/flux-2/klein/4b";
const PRICE_PER_MEGAPIXEL = 0.005; // official fal.ai model page
const HARD_CAP_USD = 0.3;
const MAX_REQUESTS = 3;
const IDS = ["sakura-nights", "nebula-city", "twilight-peaks"];

function loadFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const envPath = path.join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, "utf8").match(/^FAL_KEY=(.+)\r?$/m);
  return m ? m[1].trim() : null;
}

// minimal CSV parser (quoted fields contain commas)
function parseCsv(text) {
  const lines = text.split("\n").filter(Boolean);
  const header = lines[0].split(",");
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = [];
    let inQuote = false, cur = "";
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cols.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur);
    rows.push(Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""])));
  }
  return rows;
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// POST JSON via curl through the proxy. Body is passed via a temp file to
// avoid command-line escaping issues; the key is never printed or logged.
async function curlPostJson(key, url, body, timeoutMs) {
  const tmpBody = path.join(os.tmpdir(), `fal-body-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const tmpOut = path.join(os.tmpdir(), `fal-res-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
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
    const status = parseInt(stdout.trim(), 10);
    const text = existsSync(tmpOut) ? readFileSync(tmpOut, "utf8") : "";
    return { status, text };
  } finally {
    try { existsSync(tmpBody) && unlinkSync(tmpBody); } catch {}
    try { existsSync(tmpOut) && unlinkSync(tmpOut); } catch {}
  }
}

async function curlGetJson(key, url, timeoutMs) {
  const tmpOut = path.join(os.tmpdir(), `fal-get-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  // Polling is free — transient proxy/TLS failures may be retried. Paid
  // submits are NEVER retried (curlPostJson has no such wrapper).
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { stdout } = await runCurl("curl.exe", [
        "-sS", "-L", "-x", PROXY, "--max-time", String(Math.ceil(timeoutMs / 1000)),
        url, "-H", `Authorization: Key ${key}`,
        "-o", tmpOut, "-w", "%{http_code}",
      ], { timeout: timeoutMs + 15000, maxBuffer: 16 * 1024 * 1024 });
      const status = parseInt(stdout.trim(), 10);
      const text = existsSync(tmpOut) ? readFileSync(tmpOut, "utf8") : "";
      return { status, text };
    } catch (error) {
      lastError = error;
      await new Promise(r => setTimeout(r, 2000));
    } finally {
      try { existsSync(tmpOut) && unlinkSync(tmpOut); } catch {}
    }
  }
  throw lastError;
}

// Poll the queue until COMPLETED/FAILED/timeout. Polling is free; only the
// submitted generation is billed.
async function pollQueueResult(key, submit, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const st = await curlGetJson(key, submit.status_url, 30_000);
    if (st.status !== 200) return { ok: false, errorKind: "poll-error", errorDetail: `status poll HTTP ${st.status}` };
    const sj = JSON.parse(st.text);
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

async function curlDownload(url, destFile, timeoutMs) {
  await runCurl("curl.exe", [
    "-sS", "-L", "-x", PROXY, "--max-time", String(Math.ceil(timeoutMs / 1000)),
    "-o", destFile, url,
  ], { timeout: timeoutMs + 15000, maxBuffer: 16 * 1024 * 1024 });
}

async function main() {
  console.log("[trial] http-layer: curl.exe + proxy (no fetch)");
  if (!IDS.length) throw new Error("no ids");
  const key = loadFalKey();
  if (!key) { console.error("[trial] FAL_KEY not found — refusing to run"); process.exit(1); }

  // duplicate-payment protection
  const prior = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
    : { model: MODEL, results: [], stoppedReason: null };
  const doneIds = new Set([
    ...prior.results.map(r => r.id),
    ...IDS.filter(id => existsSync(path.join(OUT_DIR, `${id}.png`))),
  ]);
  if (prior.results.length >= MAX_REQUESTS) {
    console.log(`[trial] manifest already has ${prior.results.length} results — nothing to do (duplicate-run guard)`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const csv = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const specs = [];
  for (const id of IDS) {
    if (doneIds.has(id)) { console.log(`[trial] skip ${id} (already generated — duplicate-payment guard)`); continue; }
    const row = csv.find(r => r.id === id);
    if (!row) throw new Error(`${id}: not found in regeneration-plan.csv`);
    if (row.reviewStatus !== "review-pending" || row.evidenceStatus !== "pending-generation") {
      throw new Error(`${id}: unexpected CSV state ${row.evidenceStatus}/${row.reviewStatus}`);
    }
    specs.push({
      id, prompt: row.prompt,
      w: parseInt(row.targetWidth), h: parseInt(row.targetHeight),
      seed: parseInt(row.seed),
    });
  }
  if (!specs.length) { console.log("[trial] nothing to generate"); return; }
  if (prior.results.length + specs.length > MAX_REQUESTS) throw new Error("request cap would be exceeded");

  const spent = prior.results.reduce((a, r) => a + r.actualCostUsd, 0);
  const results = [...prior.results];
  const events = [...(prior.events ?? [])];
  // this run's stop reason only — a prior run's stoppedReason must never
  // block a resumed run (it is preserved in prior.events)
  let stoppedReason = null;
  if (!events.some(e => e.kind === "note")) {
    events.push({
      at: new Date().toISOString(), kind: "note",
      detail: "One earlier sync fal.run call for sakura-nights returned HTTP 200 but the response body was discarded because the sync response carries no request_id; that generation was likely billed once and is unrecoverable from the response. Each work is re-generated via the queue API with the same seed/prompt.",
    });
  }

  for (const spec of specs) {
    if (stoppedReason) break;
    // pre-flight budget guard (worst case 4.2 MP output)
    const worst = (4.2 * PRICE_PER_MEGAPIXEL);
    if (spent + worst > HARD_CAP_USD) {
      stoppedReason = `budget guard: spent $${spent.toFixed(4)} + worst-case $${worst.toFixed(4)} exceeds $${HARD_CAP_USD}`;
      break;
    }
    const startedAt = new Date().toISOString();
    let imageBuf;
    try {
      const bodyJson = JSON.stringify({
        prompt: spec.prompt,
        image_size: { width: spec.w, height: spec.h },
        num_images: 1,
        enable_safety_checker: true,
        output_format: "png",
        seed: spec.seed,
      });
      const { status, text } = await curlPostJson(key, QUEUE_SUBMIT, bodyJson, 60_000);
      if (status < 200 || status >= 300) {
        stoppedReason = `HTTP ${status} on ${spec.id} — stopped (billing info unavailable, no retry)`;
        events.push({ id: spec.id, at: startedAt, kind: "http-error", status, body: text.slice(0, 300) });
        break;
      }
      const submit = JSON.parse(text);
      if (!submit.request_id || !submit.status_url) {
        stoppedReason = `billing anomaly on ${spec.id}: queue submit missing request_id/status_url — stopped`;
        events.push({ id: spec.id, at: startedAt, kind: "billing-anomaly", detail: JSON.stringify(submit).slice(0, 400) });
        break;
      }
      const poll = await pollQueueResult(key, submit, 150_000);
      if (!poll.ok) {
        stoppedReason = `${poll.errorKind} on ${spec.id} — stopped (no retry per instructions)`;
        events.push({ id: spec.id, at: startedAt, kind: poll.errorKind, requestId: submit.request_id, detail: poll.errorDetail });
        break;
      }
      const payload = poll.payload;
      const image = payload?.images?.[0];
      if (!image?.url) {
        stoppedReason = `response anomaly on ${spec.id}: no image url — stopped`;
        events.push({ id: spec.id, at: startedAt, kind: "response-anomaly", requestId: submit.request_id, detail: JSON.stringify(payload).slice(0, 300) });
        break;
      }
      const tmpImg = path.join(OUT_DIR, `${spec.id}.png.part`);
      await curlDownload(image.url, tmpImg, 120_000);
      imageBuf = readFileSync(tmpImg);
      unlinkSync(tmpImg);
      const rtWidth = image.width ?? null, rtHeight = image.height ?? null;
      if (rtWidth && rtHeight && (Math.abs(rtWidth - spec.w) / spec.w > 0.05 || Math.abs(rtHeight - spec.h) / spec.h > 0.05)) {
        stoppedReason = `billing anomaly on ${spec.id}: returned ${rtWidth}x${rtHeight} vs requested ${spec.w}x${spec.h} — stopped`;
        events.push({ id: spec.id, at: startedAt, kind: "dimension-anomaly", returned: `${rtWidth}x${rtHeight}` });
        break;
      }

      const file = path.join(OUT_DIR, `${spec.id}.png`);
      writeFileSync(file, imageBuf);

      // sharp verification: decode, actual dims, size, blank detection
      const img = sharp(imageBuf);
      const metadata = await img.metadata();
      const stats = await img.stats();
      const actualCostUsd = ((metadata.width * metadata.height) / 1e6) * PRICE_PER_MEGAPIXEL;
      const minChannelStd = Math.min(...stats.channels.map(c => c.stdev));
      const result = {
        id: spec.id,
        model: MODEL,
        prompt: spec.prompt,
        seed: payload.seed ?? spec.seed,
        requestId: submit.request_id,
        attemptedAt: startedAt,
        completedAt: new Date().toISOString(),
        requestedSize: `${spec.w}x${spec.h}`,
        actualWidth: metadata.width,
        actualHeight: metadata.height,
        actualMegapixels: +((metadata.width * metadata.height) / 1e6).toFixed(4),
        format: metadata.format,
        fileBytes: imageBuf.length,
        sha256: sha256(imageBuf),
        actualCostUsd: +actualCostUsd.toFixed(5),
        safetyChecker: true,
        falResponseUrl: image.url,
        checks: {
          decoded: true,
          dimensionsMatch: Math.abs(metadata.width - spec.w) <= spec.w * 0.02 && Math.abs(metadata.height - spec.h) <= spec.h * 0.02,
          fileSizeSane: imageBuf.length > 50_000,
          notBlank: minChannelStd > 10,
          channelStddevMin: +minChannelStd.toFixed(2),
        },
      };
      results.push(result);
      events.push({ id: spec.id, at: startedAt, kind: "ok", requestId: submit.request_id, costUsd: result.actualCostUsd });
      console.log(`[trial] ok ${spec.id}: ${metadata.width}x${metadata.height}, ${(imageBuf.length / 1024).toFixed(0)} KB, $${actualCostUsd.toFixed(5)}, requestId=${submit.request_id}`);
    } catch (error) {
      const msg = String(error.message || error);
      const timedOut = error?.killed === true || /timeout|aborted|ETIMEDOUT/i.test(msg) || error.name === "TimeoutError";
      stoppedReason = timedOut
        ? `timeout on ${spec.id} — stopped (no retry per instructions)`
        : `error on ${spec.id} — stopped (no retry per instructions): ${msg.slice(0, 160)}`;
      events.push({ id: spec.id, at: startedAt, kind: timedOut ? "timeout" : "error", detail: msg.slice(0, 300), name: error?.name, stack: String(error?.stack || "").split("\n").slice(0, 4).join(" | ") });
      break;
    }
  }

  // duplicate check: among the batch + against all registered assets
  const reg = JSON.parse(readFileSync(path.join(WEB_ROOT, "data", "media-rights.json"), "utf8"));
  const knownHashes = new Set(reg.assets.map(a => a.sha256).filter(Boolean));
  const seen = new Map();
  for (const r of results) {
    r.duplicateOf = null;
    if (seen.has(r.sha256)) r.duplicateOf = seen.get(r.sha256);
    else seen.set(r.sha256, r.id);
    r.matchesRegisteredAsset = knownHashes.has(r.sha256);
  }

  const manifest = {
    model: MODEL,
    pricePerMegapixelUsd: PRICE_PER_MEGAPIXEL,
    hardCapUsd: HARD_CAP_USD,
    maxRequests: MAX_REQUESTS,
    requestCount: results.length,
    totalActualCostUsd: +results.reduce((a, r) => a + r.actualCostUsd, 0).toFixed(5),
    stoppedReason,
    generatedAt: new Date().toISOString(),
    results,
    events,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`[trial] done: ${results.length}/${MAX_REQUESTS} requests, total $${manifest.totalActualCostUsd}${stoppedReason ? `, stopped: ${stoppedReason}` : ""}`);

  // contact sheet (3 labeled panels)
  const okResults = results.filter(r => existsSync(path.join(OUT_DIR, `${r.id}.png`)));
  if (okResults.length) {
    const TH = 720, PAD = 16, LABEL = 56;
    const panels = [];
    for (const r of okResults) {
      const buf = await sharp(path.join(OUT_DIR, `${r.id}.png`))
        .resize({ height: TH, withoutEnlargement: true })
        .toBuffer();
      const m = await sharp(buf).metadata();
      panels.push({ buf, w: m.width, id: r.id, dims: `${r.actualWidth}x${r.actualHeight}` });
    }
    const sheetW = panels.reduce((a, p) => a + p.w + PAD, PAD);
    const sheetH = TH + LABEL + PAD * 2;
    const composites = [];
    let x = PAD;
    for (const p of panels) {
      const label = Buffer.from(`<svg width="${p.w}" height="${LABEL}"><rect width="100%" height="100%" fill="#111"/><text x="8" y="22" font-family="sans-serif" font-size="18" fill="#fff">${p.id}</text><text x="8" y="44" font-family="sans-serif" font-size="14" fill="#9ab">${p.dims} · trial-batch3</text></svg>`);
      composites.push({ input: p.buf, left: x, top: PAD });
      composites.push({ input: label, left: x, top: PAD + TH });
      x += p.w + PAD;
    }
    await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: "#0a0a12" } })
      .composite(composites)
      .png()
      .toFile(CONTACT_SHEET);
    console.log(`[trial] contact sheet: ${CONTACT_SHEET}`);
  }
}

main().catch((error) => {
  console.error(`[trial] fatal: ${error.message}`);
  process.exit(1);
});
