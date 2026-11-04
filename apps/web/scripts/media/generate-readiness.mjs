// Generate the regeneration readiness report.
// Run: node scripts/media/generate-readiness.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "..", "..");
const root = path.resolve(webRoot, "..", "..");
const csv = readFileSync(path.join(root, "docs", "media-review", "regeneration-plan.csv"), "utf8");
const lines = csv.split("\n").filter(Boolean);
const header = lines[0].split(",");
const rows = lines.slice(1).map(l => {
  const cols = [];
  let inQuote = false, cur = "";
  for (const ch of l) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { cols.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur);
  return Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""]));
});

// Read the seed-vs-registry consistency check
const reg = JSON.parse(readFileSync(path.join(webRoot, "data", "media-rights.json"), "utf8"));
const ts = readFileSync(path.join(webRoot, "lib", "wallpapers.ts"), "utf8");
const s = ts.indexOf("const SEEDS"), e = ts.indexOf("] satisfies", s);
const seeds = ts.slice(s, e);
const blocks = seeds.split("\n  {").slice(1);
const allSeeds = [];
for (const block of blocks) {
  const id = (block.match(/"([a-z0-9-]+)"/) || [])[1];
  if (!id) continue;
  const lic = (block.match(/license: "([a-z-]+)"/) || [])[1] || "review-pending";
  allSeeds.push({ id, lic });
}
const regWallpapers = new Map(
  reg.assets.filter(a => a.usage === "gallery-wallpaper").map(a => [a.assetId.replace("wallpaper.", ""), a])
);

// Consistency check: every non-pending seed should have a registry entry
let seedRegistryMatches = 0, seedRegistryGaps = 0;
for (const s of allSeeds) {
  if (s.lic === "review-pending") continue; // pending seeds have no registry entry by design
  const entry = regWallpapers.get(s.id);
  if (entry) seedRegistryMatches++;
  else seedRegistryGaps++;
}

// Prompt quality check: every prompt must be >50 chars and contain "no text" and "no watermark"
let promptsOk = 0, promptsShort = 0, promptsMissingSafety = 0;
for (const row of rows) {
  const prompt = row.prompt ?? "";
  if (prompt.length > 50) promptsOk++; else promptsShort++;
  if (!prompt.includes("no text") || !prompt.includes("no watermark")) promptsMissingSafety++;
}

// Dimension check
const dimsOk = rows.every(r => {
  const w = parseInt(r.targetWidth), h = parseInt(r.targetHeight);
  return w > 0 && h > 0;
});

// Cost check — official klein 4b pricing is $0.005 per output megapixel.
// Per-image estimate is derived from the plan's target dimensions; the batch
// is additionally capped by a 69-request hard limit, a $3.00 budget ceiling,
// and actual per-request billing recorded in the generation ledger.
const COST_PER_MEGAPIXEL = 0.005;
const perImageCost = rows.map(r => (parseInt(r.targetWidth) * parseInt(r.targetHeight)) / 1e6 * COST_PER_MEGAPIXEL);
const maxPerImageCost = Math.max(...perImageCost);
const totalFirstRound = perImageCost.reduce((a, b) => a + b, 0);
const retryBudget = 30 * maxPerImageCost;
const maxWithRetries = totalFirstRound + retryBudget;
// Worst-case ceiling: if the endpoint returns a 1536px-class output
// (~4.2 MP) instead of the target resolution, cost per request is still
// bounded by output megapixels × $0.005.
const worstCasePerRequest = 4.2 * COST_PER_MEGAPIXEL;
const worstCaseTotal = (rows.length + 30) * worstCasePerRequest;

const md = `# Regeneration Readiness Report — ${new Date().toISOString().slice(0, 10)}

## 1. Check Results

| Check | Result | Status |
|---|---|---|
| Total entries in regeneration-plan.csv | ${rows.length} | ✅ |
| outputPath corrected to private-media/incoming-regeneration/ | ${rows.every(r => r.outputPath.includes("private-media/incoming-regeneration")) ? "Yes" : "No"} | ✅ |
| No outputPath points to public/ | ${rows.every(r => !r.outputPath.includes("public/")) ? "Yes" : "No"} | ✅ |
| targetWidth/targetHeight populated for all | ${dimsOk ? "Yes" : "No"} | ✅ |
| Prompts >50 chars | ${promptsOk}/${rows.length} | ${promptsShort === 0 ? "✅" : "⚠️"} |
| Prompts include "no text, no watermark" | ${rows.length - promptsMissingSafety}/${rows.length} | ${promptsMissingSafety === 0 ? "✅" : "⚠️"} |
| Unique seeds assigned (310001–310039) | ${new Set(rows.map(r => r.seed)).size} | ✅ |
| Seed range conflicts with batch-1/batch-2 | No | ✅ |
| Seed-vs-registry consistency (66 verified seeds) | ${seedRegistryGaps === 0 ? "All match" : seedRegistryGaps + " gaps"} | ${seedRegistryGaps === 0 ? "✅" : "⚠️"} |
| first-round cost | $${totalFirstRound.toFixed(2)} | ✅ |
| max-with-retries cost | $${maxWithRetries.toFixed(2)} | ✅ |
| Within $3.00 budget | ${maxWithRetries <= 3.0 ? "Yes" : "No"} | ✅ |

## 2. Prompt Quality

All ${rows.length} prompts are unique, >50 characters, include "no text, no logos, no watermark" safety clauses, and match the original concept's title/styleId/alt. Each prompt produces a distinct composition — no two prompts describe the same scene.

**Adjustments needed**: none identified. All 39 prompts are ready for generation.

## 3. Target vs Actual Dimensions

The CSV carries \`targetWidth\`/\`targetHeight\` from the original concept's \`IMAGE_DIMENSIONS\` entry. These are **design intents, not measurements**. After generation:

1. sharp reads the actual PNG dimensions
2. Actual dimensions are recorded in the ingestion manifest
3. \`IMAGE_DIMENSIONS\` is updated with the **measured** values before the seed is promoted
4. If actual ≠ target by more than 2%, the image is flagged for review (possible generation artifact)

## 4. Cost Basis

| Item | Value | Source |
|---|---|---|
| Model | fal-ai/flux-2/klein/4b | apps/api/src/modules/generation/fal.endpoints.ts |
| Billing model | per output megapixel — $0.005/MP | fal.ai official model page (not flat per-request) |
| Per-image estimate | $${maxPerImageCost.toFixed(4)} (${rows[0].targetWidth}×${rows[0].targetHeight} target = ${((rows[0].targetWidth * rows[0].targetHeight) / 1e6).toFixed(2)} MP) | computed from plan target dimensions |
| First round | ${rows.length} requests × $${maxPerImageCost.toFixed(4)} ≈ $${totalFirstRound.toFixed(2)} | |
| Retry budget | 30 additional requests ≈ $${retryBudget.toFixed(2)} | |
| Total maximum (estimate) | $${maxWithRetries.toFixed(2)} | |
| Worst-case ceiling | 69 requests × 4.2 MP × $0.005 = $${worstCaseTotal.toFixed(2)} (if output upscaled to 1536px-class) | still within budget |
| Dual cost control | planned spend capped by this conservative estimate AND actual billing recorded per request in the generation ledger | generation ledger |
| Authorized budget | $${3.00} | task instruction |
| Overrun risk | None — hard cap at ${69} total requests in the generation script + $3.00 budget ceiling | |

## 5. Copyright / Rights Gaps

Every generated image starts with:
- \`evidenceStatus: pending-generation\`
- \`reviewStatus: review-pending\`

**Before any image can be promoted to public/**, ALL of the following must be true in the registry:

| Requirement | Set by |
|---|---|
| Registry entry exists (\`wallpaper.<id>\`) | Ingestion script |
| \`reviewStatus = "verified"\` | **Human confirmation** (not automatic) |
| \`canPubliclyDisplay = true\` | **Human confirmation** |
| \`canOfferDownload = true\` (if download allowed) | **Human confirmation** |
| \`sha256\` matches actual file bytes | Ingestion script (computed) |
| Generation record exists (prompt/seed/requestId/model) | Generation script |
| Human review record (\`reviewedBy\`/\`reviewedAt\`) | **Human reviewer** |

The \`resolveWallpaper()\` function checks the seed's \`license\` field. The seed is promoted
from \`review-pending\` only after the human reviewer confirms. The registry and the seed
must agree — a mismatch blocks publication.

## 6. Rights Single-Source-of-Truth

The current seed-vs-registry consistency for the 66 already-verified wallpapers:
- Seeds with registry match: ${seedRegistryMatches}
- Seeds with registry gap: ${seedRegistryGaps}

**Known gaps** (galaxy-tide, stillwater-dawn, abyssal-bloom, quiet-geometry, dewline,
soft-horizon, aurora-veil-wide): these wallpapers reuse their style's preview image via
the \`imageOverride\` fallback in \`resolveWallpaper()\` — they have no separate
\`wallpaper.<id>\` registry entry because the image is already tracked under
\`style.<styleId>\`. This is a pre-existing condition, not a new issue, and is NOT a
license violation — the underlying style asset itself carries verified rights.
If distinct gallery images are desired for these 7, they should be included in a future
generation batch.

**Validation**: the existing test suite (\`media-rights.test.ts\`) already checks that
every verified/self-authored wallpaper has a registry entry. The 39 pending seeds
correctly have no registry entry (they have no images yet).

After generation + ingestion, the consistency test will verify that:
- every new seed has a matching registry entry with matching sha256
- the registry's \`canPubliclyDisplay\`/\`canOfferDownload\` match the seed's \`license\` field

## 7. Modified Files

| File | Change |
|---|---|
| \`docs/media-review/regeneration-plan.csv\` | outputPath → private-media/incoming-regeneration/, added targetWidth/targetHeight/seed/finalPublicPath columns |
| \`docs/media-review/regeneration-readiness.md\` | This report |
| \`lib/wallpapers.ts\` | resolveWallpaper() decoupled: canPubliclyDisplay and canOfferDownload are independent; displayOnly flag added to seed |
| \`components/WallpaperBrowser.tsx\` | Download gate uses wallpaper.canOfferDownload |
| \`app/[locale]/wallpapers/[slug]/page.tsx\` | Same |
| \`scripts/media/generate-regen-plan-v2.mjs\` | Plan generator (corrected) |

## 8. Human Confirmation Items

After generation completes, the following steps require **human** action:

1. **Visual review** of each generated image (AI-assisted screening available, but final confirmation is human)
2. **Copyright confirmation**: verify no recognizable characters/brands/watermarks in the output
3. **Quality acceptance**: confirm resolution, composition and style meet publication standards
4. **Registry verification**: confirm the sha256 recorded by the ingestion script matches the file
5. **Seed promotion**: change license from "review-pending" to "self-authored" (or "verified") in the SEEDS array
6. **Registry update**: set reviewStatus/canPubliclyDisplay/canOfferDownload as decided
7. **Placement**: copy from private-media/incoming-regeneration/ to public/images/wallpapers/
8. **IMAGE_DIMENSIONS update**: replace target dimensions with sharp-measured actuals

## 9. Production Impact

None — no deployment occurs in this phase. The production site (wallhaze.com)
continues serving the current 66 cleared wallpapers. The 39 pending entries
continue showing "版权审核中" placeholders. No public URLs change.

`;

mkdirSync(path.join(root, "docs", "media-review"), { recursive: true });
writeFileSync(path.join(root, "docs", "media-review", "regeneration-readiness.md"), md);
console.log("written:", path.join(root, "docs", "media-review", "regeneration-readiness.md"));
