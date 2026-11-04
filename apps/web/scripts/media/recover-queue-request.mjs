// Usage: node scripts/media/recover-queue-request.mjs <requestId> <wallpaperId>
// Recovers a paid queue request whose image download failed: polls the queue
// status (free), fetches the response, saves the PNG and appends the result
// to the matching manifest (trial for sakura-nights, regen-36 otherwise).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const runCurl = promisify(execFile);
const PROXY = "http://127.0.0.1:7897";
const WEB_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");
const OUT_DIR = path.join(WEB_ROOT, "private-media", "incoming-regeneration");
const REQUEST_ID = process.argv[2] || "01a19f80-c2b6-75b2-8875-369fed7031c4";
const WALLPAPER_ID = process.argv[3] || "sakura-nights";
const MANIFEST_PATH = WALLPAPER_ID === "sakura-nights"
  ? path.join(OUT_DIR, "trial-batch3-manifest.json")
  : path.join(OUT_DIR, "regen-36-manifest.json");
const PRICE_PER_MEGAPIXEL = 0.005;

const key = (process.env.FAL_KEY || readFileSync(path.join(REPO_ROOT, ".env.local"), "utf8").match(/^FAL_KEY=(.+)\r?$/m)?.[1]?.trim());
if (!key) { console.error("no FAL_KEY"); process.exit(1); }
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function curlJson(url, timeoutMs) {
  const tmpOut = path.join(os.tmpdir(), `rec-${Date.now()}.json`);
  try {
    const { stdout } = await runCurl("curl.exe", [
      "-sS", "-L", "-x", PROXY, "--max-time", String(Math.ceil(timeoutMs / 1000)),
      url, "-H", `Authorization: Key ${key}`,
      "-o", tmpOut, "-w", "%{http_code}",
    ], { timeout: timeoutMs + 15000, maxBuffer: 16 * 1024 * 1024 });
    console.log(`  GET ${url} -> HTTP ${stdout.trim()} | body ${existsSync(tmpOut) ? readFileSync(tmpOut, "utf8").length : 0} bytes`);
    return { status: parseInt(stdout.trim(), 10), text: existsSync(tmpOut) ? readFileSync(tmpOut, "utf8") : "" };
  } catch (e) {
    console.log(`  GET ${url} -> curl FAILED: ${String(e.message).slice(0, 400)}`);
    if (e.stderr) console.log("  stderr:", String(e.stderr).slice(0, 300));
    throw e;
  } finally {
    try { existsSync(tmpOut) && unlinkSync(tmpOut); } catch {}
  }
}

const statusUrl = `https://queue.fal.run/fal-ai/flux-2/requests/${REQUEST_ID}/status`;
const responseUrl = `https://queue.fal.run/fal-ai/flux-2/requests/${REQUEST_ID}`;

// poll until COMPLETED (free)
let payload = null;
const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  const st = await curlJson(statusUrl, 30_000);
  if (st.status !== 200) { console.error("status HTTP", st.status, st.text.slice(0, 200)); process.exit(1); }
  const sj = JSON.parse(st.text);
  console.log("  status:", sj.status);
  if (sj.status === "COMPLETED") {
    const res = await curlJson(responseUrl, 60_000);
    if (res.status !== 200) { console.error("response HTTP", res.status); process.exit(1); }
    console.log(`  response text len=${res.text.length}, head=${res.text.slice(0, 120)}`);
    try {
      payload = JSON.parse(res.text);
    } catch {
      // proxy occasionally truncates the response body; the image URL is all
      // we strictly need (prompt/seed come from the CSV)
      const m = res.text.match(/"url":"([^"]+)"/);
      if (!m) throw new Error(`response unparseable and no url found: ${res.text.slice(0, 200)}`);
      payload = { images: [{ url: m[1] }], seed: undefined };
    }
    break;
  }
  if (sj.status === "FAILED" || sj.status === "ERROR") { console.error("generation failed:", st.text.slice(0, 300)); process.exit(1); }
  await new Promise(r => setTimeout(r, 3000));
}
if (!payload) { console.error("not completed within 120s"); process.exit(1); }

const image = payload.images[0];
const tmpImg = path.join(OUT_DIR, `${WALLPAPER_ID}.png.part`);
await runCurl("curl.exe", ["-sS", "-L", "-x", PROXY, "--max-time", "120", "-o", tmpImg, image.url], { timeout: 135000, maxBuffer: 16 * 1024 * 1024 });
const imageBuf = readFileSync(tmpImg);
unlinkSync(tmpImg);
writeFileSync(path.join(OUT_DIR, `${WALLPAPER_ID}.png`), imageBuf);

const metadata = await sharp(imageBuf).metadata();
const stats = await sharp(imageBuf).stats();
// read prompt + seed from CSV properly (reuse simple parser)
function parseCsv(text) {
  const lines = text.split("\n").filter(Boolean);
  const header = lines[0].split(",");
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = []; let inQuote = false, cur = "";
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
const row = parseCsv(readFileSync(path.join(REPO_ROOT, "docs", "media-review", "regeneration-plan.csv"), "utf8")).find(r => r.id === WALLPAPER_ID);

const minChannelStd = Math.min(...stats.channels.map(c => c.stdev));
const rec = {
  id: WALLPAPER_ID,
  model: "fal-ai/flux-2/klein/4b",
  prompt: row.prompt,
  seed: payload.seed ?? parseInt(row.seed),
  requestId: REQUEST_ID,
  attemptedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  requestedSize: `${row.targetWidth}x${row.targetHeight}`,
  actualWidth: metadata.width,
  actualHeight: metadata.height,
  actualMegapixels: +((metadata.width * metadata.height) / 1e6).toFixed(4),
  format: metadata.format,
  fileBytes: imageBuf.length,
  sha256: sha256(imageBuf),
  actualCostUsd: +(((metadata.width * metadata.height) / 1e6) * PRICE_PER_MEGAPIXEL).toFixed(5),
  safetyChecker: true,
  falResponseUrl: image.url,
  recoveredVia: "queue status/response polling after in-run poll failure",
  checks: {
    decoded: true,
    dimensionsMatch: Math.abs(metadata.width - parseInt(row.targetWidth)) <= parseInt(row.targetWidth) * 0.02 && Math.abs(metadata.height - parseInt(row.targetHeight)) <= parseInt(row.targetHeight) * 0.02,
    fileSizeSane: imageBuf.length > 50_000,
    notBlank: minChannelStd > 10,
    channelStddevMin: +minChannelStd.toFixed(2),
  },
};

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const existingIdx = manifest.results.findIndex(r => (r.id ?? r.wallpaperId) === WALLPAPER_ID);
if (existingIdx >= 0) {
  // A record already exists (left "submitted"/"unknown" by an interrupted
  // run): fill in the recovered result without losing the audit fields.
  const prev = manifest.results[existingIdx];
  manifest.results[existingIdx] = {
    ...prev,
    actualWidth: rec.actualWidth,
    actualHeight: rec.actualHeight,
    bytes: rec.fileBytes,
    sha256: rec.sha256,
    actualCost: rec.actualCostUsd,
    generationStatus: "completed",
    checks: rec.checks,
    falResponseUrl: rec.falResponseUrl,
    recoveredVia: rec.recoveredVia,
  };
} else {
  manifest.results.push(rec);
}
manifest.requestCount = manifest.results.filter(r => ["submitted", "completed"].includes(r.generationStatus ?? "completed")).length;
manifest.totalActualCostUsd = +manifest.results.reduce((a, r) => a + (r.actualCost ?? r.actualCostUsd ?? 0), 0).toFixed(5);
manifest.events.push({ id: WALLPAPER_ID, at: new Date().toISOString(), kind: existingIdx >= 0 ? "ok-recovered-existing-record" : "ok-recovered", requestId: REQUEST_ID, costUsd: rec.actualCostUsd });
manifest.stoppedReason = null;
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`[recover] saved ${WALLPAPER_ID}.png ${metadata.width}x${metadata.height} ${(imageBuf.length / 1024).toFixed(0)} KB $${rec.actualCostUsd}`);
