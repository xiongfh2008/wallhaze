# Pending Wallpapers Review — 2026-11-02

## Executive Summary

| Metric | Value |
|---|---|
| Total review-pending wallpapers | **39** |
| With independent original image file | **0** |
| With registry entry in media-rights.json | **0** |
| With license evidence (CC0/authored/etc.) | **0** |
| With generation provenance (prompt/seed/model) | **0** |
| Can be approved for display + download | **0** |
| Can be approved for display only | **0** |
| Should remain isolated | **39** |
| Recommended for regeneration | **39** |
| Would duplicate style preview if promoted as-is | **39/39** |

**Conclusion**: none of the 39 review-pending wallpapers can be promoted. They are creative
concepts (title + style + alt text) with no corresponding image file, no registry entry, no
license evidence, and no generation provenance. The 2026-10-28 audit correctly revoked their
previous promotion. Every entry is classified as REPLACE_WITH_NEW_ORIGINAL.

---

## A. 39 Review-Pending Gallery Wallpapers

Each wallpaper has a title, styleId and alt text (the creative concept), but:
- no image file exists anywhere in the project
- no `wallpaper.<id>` entry exists in media-rights.json
- no source URL, license type, or audit trail is recorded
- all detail pages return 404 for their image files

All 39 styleIds have a cleared style preview in the registry — but using that preview as
the wallpaper image would create 39 duplicate images (one style preview reused across a
1:1 title-to-image mapping), violating content uniqueness.

| # | ID | Title | Style | Has File | Has Registry | Has Style Preview | Decision |
|---|---|---|---|---|---|---|---|
| 1 | sakura-nights | Sakura Nights | anime | No | No | Yes |  no image to match against |
| 2 | neon-rain | Neon Rain | cyberpunk | No | No | Yes |  no image to match against |
| 3 | floating-isles | Floating Isles | fantasy | No | No | Yes |  no image to match against |
| 4 | twilight-peaks | Twilight Peaks | nature | No | No | Yes |  no image to match against |
| 5 | violet-orb | Violet Orb | minimalist | No | No | Yes |  no image to match against |
| 6 | mirror-desert | Mirror Desert | surreal | No | No | Yes |  no image to match against |
| 7 | nebula-city | Nebula City | sci-fi | No | No | Yes |  no image to match against |
| 8 | astral-drift | Astral Drift | sci-fi | No | No | Yes |  no image to match against |
| 9 | liquid-ribbons | Liquid Ribbons | abstract | No | No | Yes |  no image to match against |
| 10 | storm-ridge | Storm Ridge | dark | No | No | Yes |  no image to match against |
| 11 | chrome-orbit | Chrome Orbit | 3d-art | No | No | Yes |  no image to match against |
| 12 | haze-room | Haze Room | dreamcore | No | No | Yes |  no image to match against |
| 13 | ring-station | Ring Station | sci-fi | No | No | Yes |  no image to match against |
| 14 | dawn-lake | Dawn Lake | photography | No | No | Yes |  no image to match against |
| 15 | graphite-valley | Graphite Valley | pencil-sketch | No | No | Yes |  no image to match against |
| 16 | charcoal-sea | Charcoal Sea | charcoal-drawing | No | No | Yes |  no image to match against |
| 17 | crane-pine | Crane & Pine | ink-drawing | No | No | Yes |  no image to match against |
| 18 | bloom-wash | Bloom Wash | watercolor | No | No | Yes |  no image to match against |
| 19 | impasto-night | Impasto Night | oil-painting | No | No | Yes |  no image to match against |
| 20 | pixel-skyline | Pixel Skyline | pixel-art | No | No | Yes |  no image to match against |
| 21 | neon-alley | Neon Alley | cinematic | No | No | Yes |  no image to match against |
| 22 | crimson-keep | Crimson Keep | gothic-horror | No | No | Yes |  no image to match against |
| 23 | the-drifter | The Drifter | supernatural-horror | No | No | Yes |  no image to match against |
| 24 | the-unseen | The Unseen | cosmic-horror | No | No | Yes |  no image to match against |
| 25 | tape-07 | Tape 07 | analog-horror | No | No | Yes |  no image to match against |
| 26 | wrong-room | Wrong Room | psychological-horror | No | No | Yes |  no image to match against |
| 27 | melting-hour | Melting Hour | nightmare-surrealism | No | No | Yes |  no image to match against |
| 28 | cursed-grove | Cursed Grove | dark-fantasy | No | No | Yes |  no image to match against |
| 29 | ash-highway | Ash Highway | post-apocalyptic | No | No | Yes |  no image to match against |
| 30 | after-class | After Class | horror-anime | No | No | Yes |  no image to match against |
| 31 | the-circle | The Circle | occult-ritual | No | No | Yes |  no image to match against |
| 32 | last-train | Last Train | retro-cel | No | No | Yes |  no image to match against |
| 33 | petal-bloom | Petal Bloom | shoujo | No | No | Yes |  no image to match against |
| 34 | ignition | Ignition | shonen | No | No | Yes |  no image to match against |
| 35 | cloud-friends | Cloud Friends | chibi | No | No | Yes |  no image to match against |
| 36 | rooftop-duel | Rooftop Duel | manga | No | No | Yes |  no image to match against |
| 37 | hangar-rain | Hangar Rain | mecha | No | No | Yes |  no image to match against |
| 38 | great-wave | Great Wave | ukiyo-e-anime | No | No | Yes |  no image to match against |
| 39 | sunset-cafe | Sunset Cafe | cozy-anime | No | No | Yes |  no image to match against |

---

## B. 27 legacy.style.* Isolated Assets

| Fact | Value |
|---|---|
| sourceType | legacy-local-unknown (all 27) |
| licenseType | unknown (all 27) |
| auditVerified | null (all 27) |
| Image files on disk | **0 / 27** |
| Paths recorded | private-media/review-pending/styles/*.webp (not present) |

These are pre-pipeline style preview concepts. No generation record, no license evidence,
no source attribution. **All 27 must remain isolated.** They cannot be promoted to display
or download without first obtaining verifiable rights.

---

## C. 8 Restricted Assets (external-ai-unknown)

All 8 point to `trae-api-cn.mchost.guru` external URLs (an IDE's built-in AI image
generation endpoint). The model, service agreement, and licensing terms of that endpoint
are unknown. All are marked `aiGenerated: true` with `licenseType: unknown`.

| # | Asset ID | Notes |
|---|---|---|
| 1 | remote.hero.legacy | Retired from homepage; no longer referenced |
| 2 | remote.studio-sample.legacy | Retired from homepage; no longer referenced |
| 3-8 | remote.style.{anime,cyberpunk,fantasy,minimalist,nature,surreal} | Removed from style catalogue |

**All 8 must remain restricted.** The generation provider (Trae IDE) has no published
commercial-use license for AI output. These cannot be verified.

---

## D. 46+ Style Previews (project-generated-ai)

The registry contains 87 style-preview
assets, of which 79 are
marked aiGenerated. These were generated in-project with recorded prompts and are verified for
**display-only** use (style picker thumbnails).

| Fact | Value |
|---|---|
| All 39 pending wallpapers have a matching cleared style preview | Yes |
| Style previews can substitute for gallery wallpapers | **No** — would create 39 duplicate images |
| Style previews are downloadable | No (canOfferDownload: false for most) |
| Style previews could be re-registered as gallery wallpapers | Not without a separate review; they are the SAME image reused across a 1:1 concept-to-image mapping |

**Conclusion**: style previews cannot substitute for unique gallery wallpapers without
violating the content-uniqueness guarantee.

---

## E. Permission Code Audit

### Current behavior

`resolveWallpaper()` in lib/wallpapers.ts:
```
canPubliclyDisplay: !pending
canOfferDownload: !pending
```
Both derive from a single boolean (`pending`). There is no way to set "display yes,
download no" for a gallery wallpaper — they are always coupled.

`isDownloadAllowed()`:
```
return license !== "review-pending"
```
Any non-pending license automatically opens download. There is no "display-only" state.

`canDownloadMediaPath()` in lib/media-rights.ts checks the registry, but is a separate
system from the wallpapers.ts seed-based flow.

### Problem

If a future asset has `canPubliclyDisplay: true` but `canOfferDownload: false` (e.g. an
AI-generated image with display rights but unclear download rights), the current code
cannot express that state.

### Recommended fix (not implemented — report only)

Files to modify:
1. `lib/wallpapers.ts` — `resolveWallpaper()`: accept separate `display` and `download`
   flags from the seed (or from the registry) instead of deriving both from `!pending`.
2. `lib/wallpapers.ts` — `isDownloadAllowed()`: check `canOfferDownload` rather than
   merely `license !== "review-pending"`.
3. `PresetWallpaperSeed` interface — add optional `displayOnly?: boolean` field.
4. `lib/media-rights.ts` — `canDownloadMediaPath()`: already registry-driven; no change
   needed if the wallpapers.ts path delegates to it.
5. `components/WallpaperBrowser.tsx` + detail page — render a "view-only" state when
   `canPubliclyDisplay && !canOfferDownload` instead of hiding the download button entirely.

---

## F. Per-Wallpaper Review Table (39 entries)

See `pending-wallpapers-review.csv` for the machine-readable version.

| # | ID | Title | Decision | Missing Evidence | Recommended Action |
|---|---|---|---|---|---|
| 1 | sakura-nights | Sakura Nights |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 2 | neon-rain | Neon Rain |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 3 | floating-isles | Floating Isles |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 4 | twilight-peaks | Twilight Peaks |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 5 | violet-orb | Violet Orb |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 6 | mirror-desert | Mirror Desert |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 7 | nebula-city | Nebula City |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 8 | astral-drift | Astral Drift |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 9 | liquid-ribbons | Liquid Ribbons |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 10 | storm-ridge | Storm Ridge |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 11 | chrome-orbit | Chrome Orbit |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 12 | haze-room | Haze Room |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 13 | ring-station | Ring Station |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 14 | dawn-lake | Dawn Lake |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 15 | graphite-valley | Graphite Valley |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 16 | charcoal-sea | Charcoal Sea |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 17 | crane-pine | Crane & Pine |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 18 | bloom-wash | Bloom Wash |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 19 | impasto-night | Impasto Night |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 20 | pixel-skyline | Pixel Skyline |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 21 | neon-alley | Neon Alley |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 22 | crimson-keep | Crimson Keep |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 23 | the-drifter | The Drifter |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 24 | the-unseen | The Unseen |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 25 | tape-07 | Tape 07 |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 26 | wrong-room | Wrong Room |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 27 | melting-hour | Melting Hour |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 28 | cursed-grove | Cursed Grove |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 29 | ash-highway | Ash Highway |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 30 | after-class | After Class |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 31 | the-circle | The Circle |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 32 | last-train | Last Train |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 33 | petal-bloom | Petal Bloom |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 34 | ignition | Ignition |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 35 | cloud-friends | Cloud Friends |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 36 | rooftop-duel | Rooftop Duel |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 37 | hangar-rain | Hangar Rain |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 38 | great-wave | Great Wave |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |
| 39 | sunset-cafe | Sunset Cafe |  no image to match against | REPLACE_WITH_NEW_ORIGINAL | no image file |

---

## G. Statistics and Action Plan

### 1. How many of the 39 have independent original images?
**0 / 39** — none have any image file on disk or in production.

### 2. How many have complete license proof?
**0 / 39** — none have any registry entry, source URL, or license evidence.

### 3. How many can be displayed and downloaded?
**0 / 39** — no evidence supports either display or download.

### 4. How many can be display-only?
**0 / 39** — there are no images to display.

### 5. How many should remain isolated?
**All 39** — until original images are created and rights are established.

### 6. How many should be regenerated?
**39 / 39** — every concept needs a new original image via the offline AI pipeline.
The concepts (titles + styleIds + alt texts) are valid creative directions and can be
used as prompt bases.

### 7. What evidence is missing per wallpaper?
For all 39: image file, registry entry, source URL, license type, generation provenance
(prompt, seed, model, date), audit verification. None of these exist.

### 8. Permission code fix — files to modify
See section E above.

### 9. Regeneration cost estimate
- 39 wallpapers × 1 request each (klein 4b) at ~$0.03/request = **~$1.20**
- Plus 6 vertical (mobile) variants if needed: +$0.18
- Total: **~$1.40** (well under the $3/batch budget)

### 10. SEO / Sitemap / Content uniqueness impact
- Promoting 39 wallpapers would add 39 detail pages to the sitemap (currently 42 cleared).
- If style previews were reused as gallery images, the site would have 39 pages all
  showing the same image as their style's picker thumbnail — a content-uniqueness
  violation that could trigger search-engine duplicate-content penalties.
- Regenerating unique originals avoids this entirely.

### 11. "Not yet available" consistency
The Terms, Privacy, About, FAQ, Help and Studio pages all consistently state that AI
wallpaper creation is "planned" and "not currently available to the public". Adding
39 regenerated originals would NOT change this — they would be platform-curated
gallery content, not user-generated results, consistent with the current messaging.
