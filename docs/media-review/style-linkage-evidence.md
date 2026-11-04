# Style-Asset Linkage Evidence — 2026-11-03

Scope: galaxy-tide, stillwater-dawn, abyssal-bloom, aurora-veil, quiet-geometry,
dewline, soft-horizon (+ aurora-veil-wide, which reuses aurora-veil's file).

Conclusion: these works reuse already-cleared imagery through the documented
`resolveWallpaper()` fallback (`seed.imageOverride ?? style.image`). The rendered
bytes are tracked under a registry asset that is independently `verified` with
display + download rights. **Content reuse is not a license violation**, and this
check makes no changes to any license state. Re-run:
`node scripts/media/verify-style-linkage.mjs`

| Work | Seed license | Rendered asset (assetId) | Resolution path | verified | display | download | sha256 match | Result |
|---|---|---|---|---|---|---|---|---|
| galaxy-tide | verified | style.starry-galaxy | no wallpaper.<id> entry; resolveWallpaper() falls back to style preview style.starry-galaxy | yes | yes | yes | yes | PASS |
| stillwater-dawn | verified | style.mountain-lake | no wallpaper.<id> entry; resolveWallpaper() falls back to style preview style.mountain-lake | yes | yes | yes | yes | PASS |
| abyssal-bloom | verified | style.deep-ocean | no wallpaper.<id> entry; resolveWallpaper() falls back to style preview style.deep-ocean | yes | yes | yes | yes | PASS |
| aurora-veil | verified | wallpaper.aurora-veil | own wallpaper.<id> registry entry | yes | yes | yes | yes | PASS |
| quiet-geometry | verified | style.architecture-minimal | no wallpaper.<id> entry; resolveWallpaper() falls back to style preview style.architecture-minimal | yes | yes | yes | yes | PASS |
| dewline | verified | style.macro-nature | no wallpaper.<id> entry; resolveWallpaper() falls back to style preview style.macro-nature | yes | yes | yes | yes | PASS |
| soft-horizon | self-authored | style.soft-gradient | no wallpaper.<id> entry; resolveWallpaper() falls back to style preview style.soft-gradient | yes | yes | yes | yes | PASS |
| aurora-veil-wide | verified | wallpaper.aurora-veil | imageOverride -> reuses wallpaper.aurora-veil (same file bytes) | yes | yes | yes | yes | PASS |

## Per-work evidence

### galaxy-tide
- Seed: `lib/wallpapers.ts` license "verified", no imageOverride (style fallback)
- Rendered asset: `style.starry-galaxy` — /images/styles/starry-galaxy.jpg
- sourceType: wikimedia-cc0 / licenseType: CC0
- evidenceStatus: not set (pre-existing entry; reviewStatus is authoritative) / reviewStatus: verified (reviewedBy: automated-rights-audit, reviewedAt: 2026-10-24)
- canPubliclyDisplay: true / canOfferDownload: true
- registry sha256: `80c3566e2e53946e6a19799fe01f7e94c962ff0a5ef524dab076f760a3c1bc86`
- file check: exists; recomputed sha256 matches registry
- verdict: PASS — rights fully carried by the referenced asset

### stillwater-dawn
- Seed: `lib/wallpapers.ts` license "verified", no imageOverride (style fallback)
- Rendered asset: `style.mountain-lake` — /images/styles/mountain-lake.jpg
- sourceType: wikimedia-cc0 / licenseType: CC0
- evidenceStatus: not set (pre-existing entry; reviewStatus is authoritative) / reviewStatus: verified (reviewedBy: automated-rights-audit, reviewedAt: 2026-10-24)
- canPubliclyDisplay: true / canOfferDownload: true
- registry sha256: `c1f38e6c734e2268d729011023404be9dcea145041a7fe8554cb0eec6231bfa5`
- file check: exists; recomputed sha256 matches registry
- verdict: PASS — rights fully carried by the referenced asset

### abyssal-bloom
- Seed: `lib/wallpapers.ts` license "verified", no imageOverride (style fallback)
- Rendered asset: `style.deep-ocean` — /images/styles/deep-ocean.jpg
- sourceType: wikimedia-cc0 / licenseType: CC0
- evidenceStatus: not set (pre-existing entry; reviewStatus is authoritative) / reviewStatus: verified (reviewedBy: automated-rights-audit, reviewedAt: 2026-10-24)
- canPubliclyDisplay: true / canOfferDownload: true
- registry sha256: `3cd73e6c37f82e045ff588f003252e4436e9c77233cb15ea994e30abd0e872a3`
- file check: exists; recomputed sha256 matches registry
- verdict: PASS — rights fully carried by the referenced asset

### aurora-veil
- Seed: `lib/wallpapers.ts` license "verified", no imageOverride (style fallback)
- Rendered asset: `wallpaper.aurora-veil` — /images/wallpapers/aurora-veil.jpg
- sourceType: wikimedia-cc0 / licenseType: CC0
- evidenceStatus: not set (pre-existing entry; reviewStatus is authoritative) / reviewStatus: verified (reviewedBy: automated-rights-audit, reviewedAt: 2026-10-24)
- canPubliclyDisplay: true / canOfferDownload: true
- registry sha256: `944c1e37e18b1e88e871261fc37db98901201e1a0138c7c2cfd47e165587ae6a`
- file check: exists; recomputed sha256 matches registry
- verdict: PASS — rights fully carried by the referenced asset

### quiet-geometry
- Seed: `lib/wallpapers.ts` license "verified", no imageOverride (style fallback)
- Rendered asset: `style.architecture-minimal` — /images/styles/architecture-minimal.jpg
- sourceType: wikimedia-cc0 / licenseType: CC0
- evidenceStatus: not set (pre-existing entry; reviewStatus is authoritative) / reviewStatus: verified (reviewedBy: automated-rights-audit, reviewedAt: 2026-10-24)
- canPubliclyDisplay: true / canOfferDownload: true
- registry sha256: `7b6fe76e33b05a7847878ec391730947f3c33626164ae64956bb7860655b71cb`
- file check: exists; recomputed sha256 matches registry
- verdict: PASS — rights fully carried by the referenced asset

### dewline
- Seed: `lib/wallpapers.ts` license "verified", no imageOverride (style fallback)
- Rendered asset: `style.macro-nature` — /images/styles/macro-nature.jpg
- sourceType: wikimedia-cc0 / licenseType: CC0
- evidenceStatus: not set (pre-existing entry; reviewStatus is authoritative) / reviewStatus: verified (reviewedBy: automated-rights-audit, reviewedAt: 2026-10-24)
- canPubliclyDisplay: true / canOfferDownload: true
- registry sha256: `796d65689916df7ee35727c087ecd95ce4dc6d1c8410fad0a0563f307e168c36`
- file check: exists; recomputed sha256 matches registry
- verdict: PASS — rights fully carried by the referenced asset

### soft-horizon
- Seed: `lib/wallpapers.ts` license "self-authored", no imageOverride (style fallback)
- Rendered asset: `style.soft-gradient` — /images/styles/soft-gradient.jpg
- sourceType: self-authored / licenseType: self-authored
- evidenceStatus: not set (pre-existing entry; reviewStatus is authoritative) / reviewStatus: verified (reviewedBy: automated-rights-audit, reviewedAt: 2026-10-24)
- canPubliclyDisplay: true / canOfferDownload: true
- registry sha256: `8b23c2efb6c7460a601ccc4ddb58dfd0595f33729b9219463956f320a691eeb0`
- file check: exists; recomputed sha256 matches registry
- verdict: PASS — rights fully carried by the referenced asset

### aurora-veil-wide
- Seed: `lib/wallpapers.ts` license "verified", imageOverride /images/wallpapers/aurora-veil.jpg
- Rendered asset: `wallpaper.aurora-veil` — /images/wallpapers/aurora-veil.jpg
- sourceType: wikimedia-cc0 / licenseType: CC0
- evidenceStatus: not set (pre-existing entry; reviewStatus is authoritative) / reviewStatus: verified (reviewedBy: automated-rights-audit, reviewedAt: 2026-10-24)
- canPubliclyDisplay: true / canOfferDownload: true
- registry sha256: `944c1e37e18b1e88e871261fc37db98901201e1a0138c7c2cfd47e165587ae6a`
- file check: exists; recomputed sha256 matches registry
- verdict: PASS — rights fully carried by the referenced asset

## Notes

- The 6 works without a `wallpaper.<id>` entry (galaxy-tide, stillwater-dawn,
  abyssal-bloom, quiet-geometry, dewline, soft-horizon) intentionally reuse their
  style's preview image. They are tracked by the seed-vs-registry consistency
  check as "known gaps" — a naming artifact of that check, not a rights defect.
- aurora-veil has its own `wallpaper.aurora-veil` entry; aurora-veil-wide reuses
  the same file via `imageOverride`, so its rights are also carried by
  `wallpaper.aurora-veil`.
- No license state (evidenceStatus / reviewStatus / canPubliclyDisplay /
  canOfferDownload) was created or modified by this verification.
