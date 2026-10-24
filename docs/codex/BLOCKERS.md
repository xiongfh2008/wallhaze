# Blockers and external verification

| Item | Evidence / required action | Impact |
|---|---|---|
| Independent PostgreSQL server | Docker daemon unavailable; no configured isolated test instance | PGlite covers DDL and transaction semantics; multi-connection lock/operational restore verification pending |
| Payment PSP | Waffo Pancake integrated in TEST mode (store active, products created, checkout session verified). Production needs prod credentials + published products; webhook needs a public URL | Test checkout works; no completed payment or live webhook delivery has been observed |
| Waffo webhook delivery | No public HTTPS endpoint/tunnel available | Return-from-checkout uses pull-based sync; webhooks are still required for payments where the buyer never returns, and for refunds |
| Waffo test payment | One verified payment reconciled manually through the sync path (100 Credits) | A second end-to-end payment with the test card and automatic crediting has not been observed without a webhook |
| Object storage | no authorized sandbox credentials | local/memory and adapter tests only; no R2/S3 integration verified |
| fal.ai | no `FAL_KEY` locally (`FAL_MOCK=1`); real paid invocation requires explicit approval. Preflight done: official endpoints, explicit `FAL_LIVE_ENABLED` opt-in, platform budget, pause, live retry protection, mock labeling | Mock/credits/budget tests pass; no live image generated. Single-call plan (≈$0.0046) is in REAL-AI-PREFLIGHT-REPORT.md and waits for approval |
| Real image metadata | async job pipeline discards provider width/height; UI shows requested size | add persisted width/height before production |
| Production storage | `LocalStorage` (local disk) only; no object storage credentials | needs R2/S3 + lifecycle/orphan cleanup |
| Production worker/DB | PGlite + embedded worker locally; no multi-worker PostgreSQL run | production requires PostgreSQL + supervised worker; not verified |
| OAuth / email | Google OAuth is implemented; the local Client ID/Secret are configured and the API reports `google:true`. A real consent round-trip has NOT been completed | Live scenarios A–F are pending the owner's manual Google authorization; production needs a separate client, HTTPS callback and a published consent screen; no email verification/recovery |
| Gallery rights | The original 39 assets still have no per-file license evidence. 16 new CC0 photo wallpapers have source/license records; 2 abstract additions are self-authored. | Legacy 39 remain review-pending; commercial use is not asserted. New CC0 sources are documented in MEDIA-SOURCES.md. |
| New tablet/desktop content | 9 tablet-native 3:4 and 9 desktop-native 16:9 files added from CC0 photos/procedural art | Real crops, never stretched; source and output records in `photo-manifest.json` |
| Floating-isles / school-life / four-season media | No licensed, high-quality source was available for a convincing result | Deliberately not shipped as low-quality placeholders; these need approved real AI video/art generation or new licensed assets |
| Expired-media cleanup | 30-day schema, expiry access control and idempotent cleanup are implemented; ops runs a DRY RUN unless `MEDIA_RETENTION_CLEANUP_ENABLED=1` and `STORAGE_DIR` is set | Actual irreversible deletion is not enabled. Existing rows are migration-marked `legacy` and are never selected. Production object storage/R2 lifecycle still required. |
| Real-device classification | IAB browser testing can change viewport but not screen CSS pixels, DPR or `maxTouchPoints` | auto device fit is covered by pure tests and desktop browser; real phone/tablet touch classification needs a physical-device check |
| Legal review | privacy/terms/refund not reviewed | drafts marked noindex; deployment blocked |
| Production rollout | explicitly not authorized | no deployment, DNS, migration, payments, Git writes |
| Real video generation | Wan/Kling adapters are implemented and payload-tested with injected fetch; `FAL_VIDEO_LIVE_ENABLED` is default-off. No real video request or billing observed | Mock video UI/jobs/storage verified; real schema/output/codec/latency/cost still needs an approved single-call test |
| Live T2V poster | Kling returns only a video; no server-side video frame extraction exists | Mock/I2V have posters; T2V UI uses a gradient and first-frame fallback |
| I2V duration range | Wan 2.2-5B supports the first 5s MVP; Kling I2V (3–15s) is researched but not wired | I2V only exposes 5 seconds; 3/4s await a real adapter |
| Video production storage | Local base64 JSON storage only; Range route reads the full object | production needs object storage, streaming Range, lifecycle/orphan cleanup |
| Public live gallery | User videos stay private in My Creations | public live content awaits asset rights, privacy and content review |
| Video pricing approval | I2V 40; T2V 40/50/60 Credits with cost bounds $0.50–$0.80 | technical proposal only; owner must approve margin, tax and refunds |
| Cross-origin deployment shape | signed image URLs mitigate SameSite limits | still requires `NEXT_PUBLIC_API_BASE_URL`, CORS allowlist and HTTPS in production |
| Worker operations | no scheduler/process supervisor configured | `npm run worker` must be run under a supervisor; crash recovery works via lease expiry |

Ordinary local implementation continues independently of these external items.
