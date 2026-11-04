// Build grouped preview contact sheets for the 36 regenerated wallpapers.
// Reads regen-36-manifest.json + regeneration-plan.csv, groups works by
// theme, writes one sheet per group (thumbnail + id + title + dims + status)
// and a failures/unknown list file. Read-only.
//
// Run from apps/web:  node scripts/media/build-contact-sheets-36.mjs

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WEB_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");
const OUT_DIR = path.join(WEB_ROOT, "private-media", "incoming-regeneration");
const MANIFEST_PATH = path.join(OUT_DIR, "regen-36-manifest.json");
const CSV_PATH = path.join(REPO_ROOT, "docs", "media-review", "regeneration-plan.csv");

const GROUPS = {
  "Anime / Japanese": ["ignition", "petal-bloom", "cloud-friends", "rooftop-duel", "hangar-rain", "last-train", "sunset-cafe", "great-wave"],
  "Sci-Fi / Cyberpunk": ["neon-rain", "astral-drift", "ring-station", "neon-alley", "chrome-orbit", "pixel-skyline", "ash-highway"],
  "Fantasy": ["floating-isles", "mirror-desert", "haze-room"],
  "Horror / Dark": ["after-class", "crimson-keep", "the-drifter", "the-unseen", "tape-07", "wrong-room", "melting-hour", "cursed-grove", "the-circle"],
  "Nature": ["dawn-lake", "storm-ridge"],
  "Abstract / Artistic": ["violet-orb", "liquid-ribbons", "graphite-valley", "charcoal-sea", "crane-pine", "bloom-wash", "impasto-night"],
};

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

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const csv = parseCsv(readFileSync(CSV_PATH, "utf8"));
const byId = new Map(manifest.results.map(r => [r.wallpaperId, r]));
const TH = 512, PAD = 12, LABEL = 64;
const STATUS_COLOR = { completed: "#2fbf71", failed: "#e5484d", unknown: "#f5a524", submitted: "#3b82f6", pending: "#888" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function labelSvg(width, id, title, dims, status) {
  const color = STATUS_COLOR[status] ?? "#888";
  return Buffer.from(`<svg width="${width}" height="${LABEL}">
    <rect width="100%" height="100%" fill="#15151d"/>
    <rect x="0" y="0" width="6" height="${LABEL}" fill="${color}"/>
    <text x="14" y="24" font-family="sans-serif" font-size="19" font-weight="bold" fill="#fff">${esc(id)}</text>
    <text x="14" y="44" font-family="sans-serif" font-size="15" fill="#9ab">${esc(title)}</text>
    <text x="14" y="${LABEL - 6}" font-family="sans-serif" font-size="13" fill="${color}">${esc(dims)} · ${esc(status)}</text>
  </svg>`);
}

let sheetIndex = 0;
const written = [];
const allIds = new Set(Object.values(GROUPS).flat());
const notCovered = manifest.results.filter(r => !allIds.has(r.wallpaperId)).map(r => r.wallpaperId);
if (notCovered.length) console.log(`[sheets] WARNING ids not in any group: ${notCovered.join(", ")}`);

for (const [group, ids] of Object.entries(GROUPS)) {
  const panels = [];
  for (const id of ids) {
    const rec = byId.get(id);
    const csvRow = csv.find(r => r.id === id);
    const title = rec?.title ?? csvRow?.title ?? "";
    const status = rec?.generationStatus ?? "pending";
    const dims = rec?.actualWidth ? `${rec.actualWidth}x${rec.actualHeight}` : `${csvRow?.targetWidth ?? "?"}x${csvRow?.targetHeight ?? "?"}(target)`;
    const file = path.join(OUT_DIR, `${id}.png`);
    if (status === "completed" && existsSync(file)) {
      const buf = await sharp(file).resize({ height: TH, withoutEnlargement: true }).toBuffer();
      const m = await sharp(buf).metadata();
      panels.push({ id, title, dims, status, buf, w: m.width });
    } else {
      // failed / unknown / missing — placeholder panel
      const buf = await sharp({ create: { width: Math.round(TH * 0.5625), height: TH, channels: 3, background: "#222" } }).png().toBuffer();
      panels.push({ id, title, dims, status, buf, w: Math.round(TH * 0.5625) });
    }
  }
  const sheetW = panels.reduce((a, p) => a + p.w + PAD, PAD);
  const sheetH = TH + LABEL + PAD * 2 + 40;
  const header = Buffer.from(`<svg width="${sheetW}" height="40"><rect width="100%" height="100%" fill="#0a0a12"/><text x="14" y="27" font-family="sans-serif" font-size="22" font-weight="bold" fill="#fff">${esc(group)} — ${ids.length} works</text></svg>`);
  const composites = [{ input: header, left: 0, top: 0 }];
  let x = PAD;
  for (const p of panels) {
    composites.push({ input: p.buf, left: x, top: 40 + PAD });
    composites.push({ input: labelSvg(p.w, p.id, p.title, p.dims, p.status), left: x, top: 40 + PAD + TH });
    x += p.w + PAD;
  }
  const safe = group.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const out = path.join(OUT_DIR, `contact-sheet-36-${safe}.png`);
  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: "#0a0a12" } })
    .composite(composites).png().toFile(out);
  written.push(out);
  console.log(`[sheets] ${group}: ${panels.length} panels -> ${out}`);
  sheetIndex++;
}

// failures / unknown list
const problems = manifest.results.filter(r => r.generationStatus !== "completed");
let md = `# Regeneration batch (36) — failures / unknown\n\n`;
if (!problems.length) md += "None — all completed.\n";
for (const r of problems) {
  md += `- **${r.wallpaperId}** — status: ${r.generationStatus}${r.requestId ? `, requestId: ${r.requestId}` : ""}${r.failureDetail ? `, detail: ${r.failureDetail}` : ""}\n`;
}
md += `\nGenerated: ${new Date().toISOString()}\n`;
const probOut = path.join(OUT_DIR, "regen-36-issues.md");
writeFileSync(probOut, md);
console.log(`[sheets] issues list -> ${probOut}`);
console.log(`[sheets] done: ${written.length} group sheets`);
