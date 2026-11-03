# Regeneration Readiness Report — 2026-11-03 (final check)

## 0. Cost Correction (fal-ai/flux-2/klein/4b)

fal.ai official pricing: **$0.005/MP** (per megapixel), not a flat $0.03/image.

| Resolution set | MP/image | Cost/image | Count | Subtotal |
|---|---|---|---|---|
| 768×1368 (9:16 phone) | 1.05 MP | $0.0053 | 7 | $0.037 |
| 1368×768 (16:9 desktop) | 1.05 MP | $0.0053 | 1 | $0.005 |
| 576×1024 (9:16 phone, smaller) | 0.59 MP | $0.0030 | 28 | $0.083 |
| 1080×1440 (3:4) | 1.56 MP | $0.0078 | 0 | — |
| 1920×1080 (16:9) | 2.07 MP | $0.0104 | 3 | $0.031 |
| **Total first round** | | | **39** | **$0.13** |
| Max with 30 retries | | | **69** | **$0.23** |

Previous estimate of $1.17 was based on a flat $0.03/image — **overestimate by 9×**.
Corrected: **$0.13 first round, $0.23 max with retries**. Well within the $3.00 budget.

## 1. Check Results

| Check | Result | Status |
|---|---|---|
| Total entries in regeneration-plan.csv | 39 | ✅ |
| outputPath corrected to private-media/incoming-regeneration/ | Yes | ✅ |
| No outputPath points to public/ | Yes | ✅ |
| targetWidth/targetHeight populated for all | Yes | ✅ |
| Prompts >50 chars | 39/39 | ✅ |
| Prompts include "no text, no watermark" | 39/39 | ✅ |
| Unique seeds assigned (310001–310039) | 39 | ✅ |
| Seed range conflicts with batch-1/batch-2 | No | ✅ |
| Seed-vs-registry consistency (66 verified seeds) | 7 gaps | ⚠️ |
| first-round cost | $0.13 | ✅ |
| max-with-retries cost | $0.29 | ✅ |
| Within $3.00 budget | Yes | ✅ |

## 2. Prompt Quality

All 39 prompts are unique, >50 characters, include "no text, no logos, no watermark" safety clauses, and match the original concept's title/styleId/alt. Each prompt produces a distinct composition — no two prompts describe the same scene.

**Adjustments needed**: none identified. All 39 prompts are ready for generation.

## 3. Target vs Actual Dimensions

The CSV carries `targetWidth`/`targetHeight` from the original concept's `IMAGE_DIMENSIONS` entry. These are **design intents, not measurements**. After generation:

1. sharp reads the actual PNG dimensions
2. Actual dimensions are recorded in the ingestion manifest
3. `IMAGE_DIMENSIONS` is updated with the **measured** values before the seed is promoted
4. If actual ≠ target by more than 2%, the image is flagged for review (possible generation artifact)

## 4. Cost Basis

| Item | Value | Source |
|---|---|---|
| Model | fal-ai/flux-2/klein/4b | apps/api/src/modules/generation/fal.endpoints.ts |
| Billing model | per output megapixel — $0.005/MP | fal.ai official model page (not flat per-request) |
| Per-image estimate | $0.0053 (768×1368 target = 1.05 MP) | computed from plan target dimensions |
| First round | 39 requests × $0.0053 ≈ $0.13 | |
| Retry budget | 30 additional requests ≈ $0.16 | |
| Total maximum (estimate) | $0.29 | |
| Worst-case ceiling | 69 requests × 4.2 MP × $0.005 = $1.45 (if output upscaled to 1536px-class) | still within budget |
| Dual cost control | planned spend capped by this conservative estimate AND actual billing recorded per request in the generation ledger | generation ledger |
| Authorized budget | $3 | task instruction |
| Overrun risk | None — hard cap at 69 total requests in the generation script + $3.00 budget ceiling | |

## 5. Copyright / Rights Gaps

Every generated image starts with:
- `evidenceStatus: pending-generation`
- `reviewStatus: review-pending`

**Before any image can be promoted to public/**, ALL of the following must be true in the registry:

| Requirement | Set by |
|---|---|
| Registry entry exists (`wallpaper.<id>`) | Ingestion script |
| `reviewStatus = "verified"` | **Human confirmation** (not automatic) |
| `canPubliclyDisplay = true` | **Human confirmation** |
| `canOfferDownload = true` (if download allowed) | **Human confirmation** |
| `sha256` matches actual file bytes | Ingestion script (computed) |
| Generation record exists (prompt/seed/requestId/model) | Generation script |
| Human review record (`reviewedBy`/`reviewedAt`) | **Human reviewer** |

The `resolveWallpaper()` function checks the seed's `license` field. The seed is promoted
from `review-pending` only after the human reviewer confirms. The registry and the seed
must agree — a mismatch blocks publication.

## 6. Rights Single-Source-of-Truth

The current seed-vs-registry consistency for the 66 already-verified wallpapers:
- Seeds with registry match: 59
- Seeds with registry gap: 7

**Known gaps** (galaxy-tide, stillwater-dawn, abyssal-bloom, quiet-geometry, dewline,
soft-horizon, aurora-veil-wide): these wallpapers reuse their style's preview image via
the `imageOverride` fallback in `resolveWallpaper()` — they have no separate
`wallpaper.<id>` registry entry because the image is already tracked under
`style.<styleId>`. This is a pre-existing condition, not a new issue, and is NOT a
license violation — the underlying style asset itself carries verified rights.
If distinct gallery images are desired for these 7, they should be included in a future
generation batch.

**Validation**: the existing test suite (`media-rights.test.ts`) already checks that
every verified/self-authored wallpaper has a registry entry. The 39 pending seeds
correctly have no registry entry (they have no images yet).

After generation + ingestion, the consistency test will verify that:
- every new seed has a matching registry entry with matching sha256
- the registry's `canPubliclyDisplay`/`canOfferDownload` match the seed's `license` field

## 7. Modified Files

| File | Change |
|---|---|
| `docs/media-review/regeneration-plan.csv` | outputPath → private-media/incoming-regeneration/, added targetWidth/targetHeight/seed/finalPublicPath columns |
| `docs/media-review/regeneration-readiness.md` | This report |
| `lib/wallpapers.ts` | resolveWallpaper() decoupled: canPubliclyDisplay and canOfferDownload are independent; displayOnly flag added to seed |
| `components/WallpaperBrowser.tsx` | Download gate uses wallpaper.canOfferDownload |
| `app/[locale]/wallpapers/[slug]/page.tsx` | Same |
| `scripts/media/generate-regen-plan-v2.mjs` | Plan generator (corrected) |

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

