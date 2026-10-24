# Progress

## 2026-10-21 R00 (Codex)
- Read complete user assignment. Scope and prohibitions adopted in PLAN.md.
- HEAD master b8b7e026ddd1ff33cc49fcc0e28b996c098bdbe8; scoped staging area empty; existing frontend changes preserved.
- Existing web business adapters are closed placeholders. API has health, synchronous generations and image proxy only; auth hook always rejects and is unattached.
- No database files found in permitted app/contracts paths. Available docs do not contain T04-A schema.
- Docker CLI exists but daemon is unavailable. No service started or system configuration changed.
- Initial API Vitest blocked before test collection by Windows sandbox temporary-cache rename EPERM; retry under normal user permissions planned.
- Frontend audit delegated with disjoint write ownership (docs/codex/R00-WEB.md only).
- Next: implement persistent DB/ledger, auth/payment and worker contracts, then integrate frontend.

## 2026-10-21 GLM takeover (R00 continuation → R07)

### Handover findings (verified against code, not only docs)
- HEAD unchanged at b8b7e02; no staged files; no merge conflicts; protected `wallhaze/` untouched.
- Codex had written, after its last PROGRESS entry: `migrations/001_core.sql`, `src/db/{database,migrate}.ts`,
  `src/business/{providers,storage}.ts`, and three TDD suites (`wallet`, `auth-business`, `payment-business`)
  whose implementation modules did not exist yet. Baseline measured: 14 files, 106 tests passing, 3 suites
  failing at import (missing modules).
- Schema/test drift fixed before implementing: `wallets` → `credit_wallets`; `generation_jobs`
  `input/price/cost_bound` → `request/credits/cost_micros` + defaults. No production database exists;
  schema was never released, so this is safe.

### Implemented (all in permitted paths)
- R04 `src/business/wallet.ts` — transactional ledger: `balance` is the total (spendable = balance − reserved),
  immutable `credit_ledger` rows with per-user idempotency keys, `FOR UPDATE` wallet lock, terminal
  capture/release (settle once), refund shortfall → debt + user suspension, `reconcile` against ledger sums.
- R03 `src/business/auth.ts` — scrypt password hashing (per-user salt, timing-safe compare), opaque sessions
  storing only sha256 token hashes, 30-day expiry, persistent `auth_attempts` throttling, suspended/deletion
  users rejected, wallet created on signup.
- R06 `src/business/payment.ts` — provider-neutral orders (integer minor units + currency), idempotent checkout,
  HMAC-signed mock webhook over the RAW body, durable `payment_webhook_events`, `retryReceived` replay,
  duplicate/out-of-order paid/refunded handling, owner-scoped order reads.
- R05 `src/business/jobs.ts`, `worker.ts`, `src/worker.ts` CLI — job+reservation persisted in one transaction,
  `FOR UPDATE SKIP LOCKED` claims, lease tokens/expiry with attempt fencing, capture on success, release on
  failure, provider-billed costs retained in persisted daily budgets, storage failure never charges the user.
- `src/business/routes.ts` — auth (signup/login/logout/session), wallet/packages/pricing/transactions,
  checkout, orders, webhook, async jobs + status, private creations list/detail/delete/download/image.
- `migrations/002_packages.sql` + multi-file migrator with per-version checksums.
- Signed private-image URLs (HMAC + expiry) because `<img>` subresources do not carry SameSite cookies
  cross-site; cookie auth still works same-site and remains owner-scoped.
- R01 frontend audit fixes: My Creations download honesty (3 outcomes + busy state), "create again" carries
  validated prompt/style/device/ratio/preset, gallery JSON-LD no longer claims unproven creator attribution,
  FAQ q2/q3/q4/q5/q6/q8 + terms IP copy rewritten in all 7 locales.
- R07 integration: `lib/api/jobs.ts`, `lib/studio/executor.ts` (create job → poll → resolve), Studio submit
  path now uses the real async job API behind a live gate loaded from session/pricing/wallet; real credential
  forms in `AuthPanel` when `NEXT_PUBLIC_API_BASE_URL` is configured (disabled honest state otherwise).

### Test evidence (this session)
- API: 16 files, **125 passed, 1 pre-existing skipped, 0 failed** — includes wallet (4), auth (3), payment (3),
  jobs (5), HTTP integration (4), migrations (2).
- Web: 13 files, **125 passed, 0 failed**; `tsc --noEmit` exit 0; `eslint .` exit 0.
- API build (`tsc -p tsconfig.build.json`) exit 0. Next.js production build succeeded (all locale routes).
- Concurrent edits by another tool were observed twice in `apps/web` (syntax-broken import/state blocks);
  repaired without reverting anything else. No parallel agent is currently writing.

### Still not done / blocked
- No independent PostgreSQL server (Docker daemon unavailable): multi-process lock/restore verification pending;
  PGlite covers real PostgreSQL DDL/semantics but not multi-connection server behavior.
- No real PSP, object storage (R2), OAuth/email or fal.ai credentials: adapters + mocks only.
- Credits purchase UI stays gated: the mock checkout URL is not a real payment page, so no working "buy" button
  is exposed. Wiring needs a real PSP sandbox.
- Deletion/account requests and refunds UI are not implemented; legal drafts and per-wallpaper licensing remain
  unreviewed. Nothing was marked commercially licensed.

## 2026-10-21 GLM continuation #2 (R07 completion + R08 partial)

### Added
- `apps/web/components/credits/CreditsClient.tsx` — live wallet, packages, ledger and orders for the signed-in
  user; the exact previous "not connected" copy when unconfigured; a sign-in prompt when signed out. Checkout
  buttons stay disabled with an explicit reason (no real PSP).
- `apps/web/components/credits/OrdersPanel.tsx` + `/account/orders` — real provider-neutral order list.
- `apps/web/components/creations/CloudCreations.tsx` + `/my-creations` — account cloud creations (signed image
  URLs resolved against the API origin, cloud delete after confirm), clearly separate from local history.
- `apps/web/components/auth/AccountPanel.tsx` + `/account` — real session summary, sign-out, links to Credits
  and My Creations; honest signed-out/unconfigured states.
- `apps/api/src/business/maintenance.ts` + `src/ops.ts` (`npm run ops`) — stale-lease sweep (30 min) that fails
  abandoned jobs and releases held credits, plus full wallet↔ledger reconciliation with non-zero exit on
  mismatch. Test covers sweep, credit release, fresh-lease protection and reconciliation.
- `docs/codex/OPERATIONS.md` and an updated `apps/api/.env.example` — process model, required production
  configuration, security posture, backup/restore outline and known gaps. No real secrets.

### Copy
- Seven locales updated for: credits panel states, ledger reasons, order statuses, cloud creations, account
  summary, and the previously stale FAQ/terms statements about services and licensing.

### Test evidence (continuation #2)
- API: **126 passed, 1 skipped, 0 failed** (16 files); `tsc --noEmit` exit 0; build exit 0.
- Web: **125 passed, 0 failed** (13 files); `tsc --noEmit` exit 0; `eslint .` exit 0; `next build` succeeded
  (414 pages generated).
- Still no Git writes, no deployment, no real paid calls, no real payment.

### Remaining
- Real PSP + purchase UI, object storage, live AI call verification, independent PostgreSQL server tests.
- Refund execution UI (needs PSP), automatic purge execution (manual by design), legal review and licensing.

## 2026-10-21 GLM continuation #3 (account lifecycle + retention)

### Added
- `apps/api/src/business/account.ts` + routes `GET /v1/account`, `POST /v1/account/deletion-request`,
  `POST /v1/account/deletion-cancel` — idempotent request per user (one row, reopened after cancel),
  every session revoked and the cookie cleared on request. Execution stays manual because credit/payment
  records are legally retained and the ledger is append-only.
- `cleanupRetention` in `maintenance.ts` + wired into `npm run ops`: removes auth attempts older than 24 h,
  PROCESSED webhook events older than 90 days and canceled deletion requests older than 30 days. Ledger,
  orders, payments and jobs are never deleted.
- `apps/web/components/auth/SettingsPanel.tsx` + `/account/settings` — real sign-out and the full
  request → pending → cancel lifecycle with explicit copy; signed-out/unconfigured states preserved.
- `/v1/creations` now lists only `succeeded` jobs (failed jobs are polled via the job endpoint, not offered
  as artwork).

### Tests added
- `tests/account.test.ts` (3): request revokes sessions and is idempotent; cancel + reopen keeps one row;
  retention removes only expired auxiliary rows and never touches the ledger.
- `tests/routes-business.test.ts` (2 new): HTTP deletion request → session dead → sign in → cancel;
  worker failure releases reserved credits and the job is excluded from creations.

### Test evidence (continuation #3)
- API: **17 files, 131 passed, 1 skipped, 0 failed**; `tsc --noEmit` and build exit 0.
- Web: **125 passed**; `tsc --noEmit` exit 0; `eslint .` exit 0; `next build` succeeded (414 pages).
- Still no Git writes, no deployment, no real paid calls, no real payment.

## 2026-10-21 GLM continuation #4 (Waffo Pancake PSP, test environment)

### Integration
- Installed `@waffo/pancake-ts@0.26.0` (single package, zero transitive deps) in `apps/api`.
- Refactored `PaymentAdapter`: adapters now own signature verification AND payload normalization
  (`parseWebhook(raw, signature) -> NormalizedWebhookEvent`). The money-handling service is provider-blind.
- `apps/api/src/business/waffo.ts`: RSA-SHA256 webhook verification over the RAW body, event `mode` must equal
  `PAYMENT_ENVIRONMENT`, correlation via `orderMerchantExternalId` (fallback `orderMetadata.orderId`),
  pre-tax `listPrice.subtotal` / `originalPayment.subtotal` converted from display strings to minor units,
  `order.completed → paid`, `refund.succeeded → refunded`, everything else recorded as ignored.
- `migrations/003_payment_products.sql` + `payment_products(provider, package_id, product_id)` mapping.
- `src/payments/waffo-setup.ts` (`npm run waffo:check` / `waffo:setup [--apply] [--publish] [--webhook-url]`):
  read-only credential/store check, explicit product creation for each credit package, optional webhook
  registration. `--publish` is refused outside `PAYMENT_ENVIRONMENT=prod`.
- Production now REFUSES to boot with the mock payment adapter; `PAYMENT_PROVIDER=waffo` requires merchant id
  and private key. `PAYMENT_ENVIRONMENT` defaults to `test`.
- Local dev: `PGLITE_DIR` file-backed PGlite database (single-process, refused in production) so the full
  checkout flow can run without Docker/PostgreSQL; `loadEnvFile()` loads `.env` in every entry point.
- Frontend: `/v1/credits/pricing` exposes `paymentProvider`/`checkoutAvailable`; the Credits panel enables the
  buy button only when true, uses a stable per-package idempotency key, and redirects to the provider URL.

### Live test-environment evidence (2026-10-21)
- `npm run waffo:check` → store `STO_6B4x7JlBPsRr5vBszGv4kJ` ("WallHaze", active) visible to the merchant.
- `waffo:setup --apply` created three TEST products and mapped them locally:
  starter → `PROD_2fzQmmHeNO9fkFyxCh9KNm`, creator → `PROD_4JylGXrQbUAji1Pnk8nxPZ`,
  studio → `PROD_7BwCjXCa8wVvCTmNwKCMA7` (not published to production).
- Started the API locally (PGlite + Waffo test): signup → `POST /v1/payments/checkout` returned a real
  `https://pancake.waffo.ai/store/wallhaze-6ucttcvs/checkout/cs_...` session; repeating the same
  `Idempotency-Key` returned the SAME order and session; `/v1/orders` shows the order `pending`.
- Invalid `x-waffo-signature` → 403. Webhook signature/normalization covered by 9 adapter tests using a
  locally generated keypair (`WAFFO_WEBHOOK_TEST_PUBLIC_KEY`).
- No payment was completed and no real money moved. The test card flow and a public webhook URL were not
  exercised from this environment.

### Test evidence (continuation #4)
- API: **18 files, 140 passed, 1 skipped, 0 failed**; `tsc --noEmit` and build exit 0.
- Web: **127 passed**; `tsc --noEmit` exit 0; `eslint .` exit 0; `next build` succeeded (414 pages).
- Secrets: only in `apps/api/.env` (gitignored); `.data/` gitignored. No key was written into source or docs.

### Remaining for PSP go-live
- Register the webhook URL (`waffo:setup --webhook-url https://<api-host>/v1/payments/webhook`) once a public
  endpoint exists; test-mode webhooks currently have no reachable URL.
- Complete one end-to-end payment with the Waffo test card (4576750000000110) and confirm credits appear.
- Production: prod merchant credentials, publish products with `--publish`, real storage, `IMAGE_URL_SECRET`.
- Rotate the merchant private key that was shared in chat once testing concludes.

## 2026-10-21 GLM continuation #5 (webhook replay ops + UI gate tests)

### Added
- `retryReceivedEvents(db, provider)` extracted in `payment.ts` and wired into `npm run ops` (fields:
  `replayedWebhookEvents`, flag `--no-replay`). A crash between recording a verified webhook and settling the
  order can no longer leave a paid order uncredited without an operator-visible recovery path.
  Covered by a new test that replays a stored NORMALIZED event (the Waffo shape) and asserts exactly-once credit.
- `/v1/credits/pricing` assertions in the HTTP suite: the mock provider reports `checkoutAvailable: false`, so
  the web buy button cannot become enabled against a non-redirectable provider.
- `tests/credits-panel.dom.test.ts` (3): backend balance rendered and buy enabled only when
  `checkoutAvailable`; disabled with the blocked copy otherwise; signed-out shows the prompt and no balance.

### Test evidence (continuation #5)
- API: **18 files, 141 passed, 1 skipped, 0 failed**; `tsc --noEmit` and build exit 0.
- Web: **14 files, 130 passed**; `tsc --noEmit` exit 0; `eslint .` exit 0; `next build` succeeded (414 pages).
- No Git writes; no real payment; secrets still only in the ignored `.env`.

## 2026-10-21 GLM continuation #6 (login diagnosis and fix)

### Reported symptom
"无法登录" while the web app was running on :3100.

### Root causes found (both real)
1. **Web had no API base URL.** The running `next start` served a build without `NEXT_PUBLIC_API_BASE_URL`,
   so the auth panel rendered its intentional disabled state (no credential inputs). The API was also stopped.
2. **CORS was incomplete for credentialed browser use.** `Access-Control-Allow-Credentials` was never sent, so
   a browser rejects credentialed responses and cannot persist the session cookie; and
   `Access-Control-Allow-Headers` omitted `X-WallHaze-Client` / `Idempotency-Key`, so browser preflights for
   login/signup/checkout/jobs would fail. This affected any split-origin deployment, not just localhost.

### Fixes
- `middleware/cors.ts`: add `Access-Control-Allow-Credentials: true` (exact allowlisted origins only) and the
  missing allowed headers; preflight inherits both. Covered by a new CORS test.
- `apps/web/.env.local` (gitignored): `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`; rebuilt the web app so
  the value is inlined. API `HOST=0.0.0.0` so `localhost` (IPv4/IPv6) resolves reliably.
- `Header`: probes the session after mount and switches "Sign in" → "Account" (7 locales), so a signed-in user
  no longer sees a contradictory header.
- Local stack left running for verification: API :4000 (PGlite + Waffo test) and web :3100. Old project on
  :3000 untouched.

### Verified end-to-end in the browser
- `/login` renders real email/password fields; submitting `psp-test@example.test` redirected to `/account`,
  which shows "Signed in" and the account email.
- `/credits` shows the backend wallet (0 Credits), the three Waffo-priced packages with **enabled** Buy
  buttons, and the pending test order — i.e. the PSP gate is live against the test store.
- Cookie is `HttpOnly; SameSite=Lax` on `localhost`; preflight returns `204` with credentials + headers.

### Test evidence (continuation #6)
- API: **142 passed, 1 skipped, 0 failed**; typecheck and build exit 0.
- Web: **130 passed**; typecheck/lint exit 0; production build succeeded.

## 2026-10-21 GLM continuation #7 (account deletion removed, payment reconciliation)

### Requested changes
1. **Account deletion removed.** The Settings UI, the three `/v1/account*` routes, `AccountService`, its tests
   and the deletion copy in all seven locales were deleted. The `account_deletion_requests` table is left in
   the schema (migrations are forward-only) but nothing reads or writes it; retention cleanup no longer
   mentions it.
2. **Paid order did not credit.** Root cause: the Waffo webhook cannot reach `localhost`, and there was no
   pull path. A verified test payment (`ORD_1i7VaY…`, 5.00 USD, succeeded) existed on the store while the
   local order stayed pending.

### Payment reconciliation (new)
- `PaymentAdapter.syncOrder?()` + `PaymentService.syncOrder()`: on return from checkout the browser hits
  `POST /v1/payments/orders/:id/sync`; the server asks Waffo (GraphQL `payments` by
  `orderMerchantExternalId`, then `onetimeOrder`) and applies the same normalized event as a webhook. Crediting
  stays idempotent (ledger key + webhook-event dedup).
- `successUrl` now gets `?order=<internal id>` appended server-side so the return page knows what to verify.
  `/credits` auto-syncs pending orders on load and offers a "Refresh status" action.
- Provider calls are wrapped in a 12 s timeout — one earlier GraphQL call hung for 141 s and returned
  non-JSON.
- **GraphQL pitfall confirmed:** Waffo's merchant GraphQL rejects `ID!` variables ("Unknown type ID") for
  `onetimeOrder`; `String!` works (as their docs warn).
- **Duplicate orders fixed:** checkout now reuses an existing pending order for the same user+package within
  one hour and returns its stored hosted-session URL (new columns `provider_checkout_url` /
  `provider_checkout_expires_at`, migration 004) instead of creating another provider order. A settled order
  returns 409.

### Live reconciliation performed
- The verified payment `83db2dd4…` (user `xiongfh2000@gmail.com`) was credited through the sync path:
  order → `paid`, wallet → **100 Credits**, ledger idempotent. Two other pending orders for the same account
  are unpaid and remain pending.
- Browser verification: `/account/settings` now shows only language + sign out; `/credits` renders the live
  balance/orders and the pending "Refresh status" control.

### Test evidence (continuation #7)
- API: **18 files, 141 passed, 1 skipped, 0 failed**; typecheck and build exit 0.
- Web: **130 passed**; typecheck and lint exit 0; production build succeeded.

## 2026-10-21 GLM continuation #8 (AI Studio device/size/styles/layout)

### Audit baseline
- 37 styles across 7 categories, each with a prompt template; 6 popular ones use a remote
  illustration service, the rest local/gradient artwork. Styles were already localized labels and
  descriptions in seven locales.
- Device/ratio/preset were three separate controls; a screen recommendation existed but required a manual
  click and never auto-applied. The backend accepted only built-in presets.
- The credits notice was static ("Credits required") even while a real async job was running, and the confirm
  dialog appeared whenever services were up — even with a zero balance.
- Mobile layout had a real overflow: grid children kept `min-width: auto`, so the style grid's min-content
  widened the form to 675 px inside a 375 px viewport, then `overflow-x-clip` hid the right side.

### Implemented
- **Device intelligence** (`lib/studio/device.ts`, pure): classifies phone/tablet/desktop from viewport width
  plus touch capability (no brand heuristics), estimates physical pixels as CSS size × DPR, maps the screen
  shape onto an existing server-supported preset and reports an exact vs approximate match. Manual choices are
  persisted (`wallhaze:studio:size:v1`) and never overwritten by resize; Auto is the default on first visit and
  re-detects only when clicked.
- **Unified Device & Size panel**: Auto + Phone/Tablet/Desktop, ratio, preset, custom size, detection line,
  recommendation status, and an explicit "back to recommended".
- **Custom output sizes end-to-end**: contracts (`width`/`height`), server validation (512–2048 per side,
  4 px step, area ≤ 2048², mutual exclusion with presets, ratio agreement), provider payload already supports
  `{width,height}`; web validation mirrors it. Price is unchanged (one generation = 10 Credits).
- **Styles**: added 6 differentiated styles (Paper Cut Art, Clay 3D, Low Poly, Stained Glass, Vaporwave,
  Botanical Illustration) to both the web catalogue and the API validator catalogue, with prompt templates,
  seven-language labels and descriptions. Style picker rebuilt as searchable thumbnail cards with category
  tabs, descriptions, selected badge, clear-selection and "Show all".
- **Credits/status consistency**: the notice now derives from real account/pricing/wallet state
  (loading / unavailable / signed-out / ready / insufficient / in-flight); the confirm dialog only offers
  Confirm when services are up AND the balance covers the price, and shows the blocking reason otherwise.
- **Layout**: studio container widened to 1280 px, `420px + 1fr` columns on desktop, `min-w-0` on both columns
  (fixes mobile clipping), `object-contain` result preview, target-size line, custom aspect preview, and the
  preview meta stays under the frame.
- **Prompt inspiration**: audited and kept — examples already write into the prompt editor with explicit
  Replace/Append/Cancel, per-style suggestions and a live character counter. Verified in the browser.

### Test evidence (continuation #8)
- Web: **16 files, 163 passed**; `tsc --noEmit` and `eslint .` exit 0; production build succeeded (414 pages).
- API: **20 files, 149 passed, 1 skipped, 0 failed**; `tsc --noEmit` and build exit 0.
- Browser (IAB): desktop 1440×900 → two columns 420/764, no overflow, auto "Desktop · 16:9 · Desktop Full HD";
  tablet 820×1180 → single column 757, stacked preview, no overflow; mobile 390×844 → panel 327, style grid
  2×133.5, no overflow (after the `min-w-0` fix). Custom 1020×1360 applied (summary + target line + 3:4 preview);
  Auto restored 1920×1080 and cleared the saved preference; zero-balance dialog shows price + "Not enough
  Credits" and only a Close button; style search/selection and prompt inspiration verified.
- The in-app browser screenshot API timed out / returned a black surface in this session, so no screenshot files
  were produced; verification used DOM geometry, computed styles and interaction state instead. This is a tool
  limitation, not an app error.

### Honest limits
- Exact custom pixel output is not verified against the real model (no paid calls). The provider may return a
  slightly different size; there is no crop/scale pipeline — the UI shows the provider's returned dimensions
  when available.
- Auto device detection in the browser was verified for desktop (no touch); touch tablets/phones are covered by
  injected unit tests because the automation browser cannot emulate touch.
- Reference-image upload was not re-run through the browser file picker (IAB has no upload support); its code
  path and 13 tests are unchanged and passing.

## 2026-10-22 GLM continuation #9 (Prompt Builder, subject-in-scene, preview truth)

### Audit
- Generation prompt was `userPrompt + ", " + style.promptTemplate` (plus a one-line edit instruction);
  the style had no structured palette/lighting/texture/composition fields and no prompt version.
- The reference photo already travelled to `fal-ai/flux-2/klein/4b/edit` as `image_urls`, but the prompt did
  not carry explicit subject-preservation or scene-integration rules.
- The empty preview showed a portrait demo image inside whatever frame was selected (letterboxing a 9:16
  artwork in a 16:9 frame); Chinese UI showed English inspiration examples, truncated.

### Implemented
- `apps/api/src/catalog/prompt-builder.ts`: structured Prompt Builder (scene → style → palette/light/Texture/
  composition → device framing → subject-preservation rules). `PROMPT_BUILDER_VERSION=2`, final prompt ceiling
  1600 chars (separate from the 800-char user limit). Empty input and over-long output map to 400.
- `apps/api/src/catalog/style-meta.ts`: visual-axis resolver with category baselines and per-style overrides;
  every style resolves palette/lighting/texture/composition plus a negative prompt. `WallStyle` now models
  slug, enabled, promptVersion and optional explicit axes; disabled styles are rejected.
- Jobs persist `_composed` (prompt, negative prompt, style version, builder version); the worker prefers the
  stored prompt so a later template edit cannot change a queued generation. The composed prompt is written by
  the server after validation — clients cannot inject it.
- Reference flow: the edit request now carries explicit "use the reference subject / preserve appearance /
  place it in the new scene / match perspective and shadows / do not substitute" instructions, plus phone
  lock-screen composition guidance. Reference-only requests get a neutral scene instead of failing.
- Privacy: the reference base64 is stripped from `generation_jobs.request` on success, failure and stale-lease
  sweep; the subject hint states that the photo is sent to the AI provider and removed after settlement.
- Studio UI: collapsed "Device & Size" card with the current recommendation and a "Change device or size"
  affordance; subject photo wording/hint; empty preview is now a ratio-correct gradient placeholder (no
  portrait demo in a landscape frame); localized inspiration examples for the six non-English locales;
  reference status shown under the preview.

### Test evidence (continuation #9)
- API: **21 files, 159 passed, 1 skipped, 0 failed**; typecheck and build exit 0.
- Web: **20 files, 164 passed**; typecheck/lint exit 0; production build succeeded (414 pages).
- Browser: desktop 1440×900 (16:9 frame 384×216, empty preview labelled, no overflow), tablet 820×1180
  (single column 757, stacked preview), mobile 390×844 (panel 327, no overflow). Chinese UI shows localized
  inspiration, "添加主体图片", "更换设备或尺寸"; zero-balance dialog shows only Close + insufficient reason.
- IAB screenshots still fail in this environment; verification used DOM geometry with animations disabled.

### Still requiring real-model validation
- Subject fidelity and scene integration quality for the `/edit` model (no paid calls).
- Exact custom output pixels; no crop/pad/scale export pipeline exists.
- Whether the model accepts a negative prompt (currently not sent).

## 2026-10-22 GLM continuation #10 (generation stuck: worker + local DB incident)

### Diagnosis
- The API was reachable: jobs returned 202 and the Studio polled `GET /v1/generations/jobs/:id` every ~2 s.
- No worker process existed, and the local environment has `FAL_MOCK=1` (no real FAL key). Jobs therefore
  stayed `queued`, holding 20 reserved Credits for the two attempts.
- Root cause of the "long generation": no consumer for the queue, not a broken interface.

### Fixes
- **Embedded worker for local PGlite.** PGlite is single-process, so a separate worker cannot share the data
  directory. `EMBED_WORKER=1` now starts the worker loop inside the API process with the SAME storage instance;
  production continues to use PostgreSQL + a separate `npm run worker`.
- **Honest mock mode.** The mock provider now returns a valid 768×768 violet-gradient PNG (built with
  node:zlib) instead of a 12-byte invalid header. Jobs created while `FAL_MOCK=1` are marked `mock`, the Studio
  shows "Development mock preview — no AI model was called and no Credits were charged", mock results are not
  written to local history, and mock completion releases the reservation instead of capturing it
  (ledger reason `generation.mock`). The two queued jobs completed, released 20 Credits, and produced valid
  assets.
- Shared `STORAGE_DIR=.data/images` for the API and embedded worker.

### Incident (must be disclosed)
- While restarting the API to load the worker, a forced process kill left `postmaster.pid` and corrupted the
  PGlite WAL: `PANIC: could not locate a valid checkpoint record`. The directory could not be reopened and no
  backup existed.
- The corrupt directory is preserved at `apps/api/.data/pglite` (rename was blocked by a Windows file lock);
  a fresh database lives at `.data/pglite-fresh`. **Local accounts, wallets, orders and queued jobs from the
  previous PGlite database were lost.** Browser-local favorites/history are unaffected; production data is
  unaffected (no production database was ever touched).
- Prevention recorded in OPERATIONS.md: use PostgreSQL for anything beyond a demo; never force-kill a PGlite
  process; add a graceful shutdown path before restarting.

## 2026-10-22 GLM continuation #11 (login failure: second local DB loss + recovery tooling)

### Root cause
- The login endpoint was healthy: a wrong password returned `UNAUTHENTICATED`, and the browser was still showing
  the persisted "尝试次数过多" alert from an earlier 10-failure throttle.
- The actual failure was a second local PGlite loss. `.data/pglite-fresh` hit
  `PANIC: could not locate a valid checkpoint record` after the API was hard-killed (to run a credit-restore
  script). The account and its 200 test Credits no longer existed, and the browser's session cookie pointed at a
  token in the lost database. The first corrupt directory (`.data/pglite`) was still locked by a Windows file
  handle, so neither corrupt directory could be renamed.

### Fixes
- `src/db/pglite-guard.ts` + `pglite-probe.ts`: child-process startup probe (WASM aborts no longer kill the API),
  corruption-only quarantine, newest-backup restore, absolute paths, last-3 backups on graceful close, and a
  startup refusal when another API already answers on `PORT`. Infrastructure probe failures never quarantine a
  healthy directory.
- `POST /internal/shutdown` (`src/modules/ops/shutdown.routes.ts`, timing-safe token, dev only) and
  `npm run stop` (`scripts/stop.mjs` + `OPS_SHUTDOWN_TOKEN`).
- `server.ts`: guarded open, resolved database directory for backups, clean close on listen failure, and a
  shutdown that stops the worker before closing Fastify and the database.
- `ops.ts`: works on PGlite, runs migrations, refuses while the API is running, and adds `--ensure-user`,
  `--reset-password`, `--grant`, `--wallet` (plus the existing `--unlock`). `auth.ts` gained
  `createCredentialUser` / `resetUserPassword` (no session on create; reset revokes sessions and clears
  throttles). New tests: `ops-recovery.test.ts`, `ops-shutdown.test.ts` — full API suite 168 passed.
- Credits page: removed the static "purchases restricted" banner that contradicted a configured provider and
  updated future-tense copy (subtitle, FAQ, sign-in prompt, notices) in all seven locales; added ledger labels
  for `ops.grant` and `generation.mock`.

### Recovery performed
- New database `.data/pglite-dev`; account `xiongfh2000@gmail.com` recreated via `--ensure-user` (temporary
  password delivered to the user) and granted 200 Credits (`ops.grant`).
- `npm run waffo:setup -- --apply` recreated the three test products and mappings (new product ids; the previous
  test-mode products remain unused in the Waffo store).
- Verified: HTTP login 200 and wallet 200; browser login `/zh/login` → `/zh/account` (header shows 账户); Credits
  page shows 200, packages, the ledger entry and no restricted banner; Studio shows 余额 200 with an enabled
  generate button. `npm run stop` exits 0, writes a backup, and the next boot passes the probe.
- Both corrupt directories are preserved in `apps/api/.data/` (rename blocked by a Windows handle).

### Remaining
- A completed Waffo test payment has still not been observed end-to-end (test checkout session creation works;
  webhook delivery needs a public HTTPS URL).

## 2026-10-23 GLM continuation #12 (Google sign-in)

### Added
- **API OAuth provider** (`src/business/oauth.ts`): Authorization Code + PKCE
  (S256), signed state cookie carrying state/verifier/nonce/returnTo (10 min),
  Google JWKS RS256 verification (1 h cache), and strict ID-token claim checks
  (issuer, audience, expiry, nonce, `email_verified`). Both flows are covered by
  `tests/google-oauth.test.ts` with a locally generated RSA key — no network.
- **Routes**: `GET /v1/auth/oauth/google/status`, `.../start` (signin and
  explicit link modes, open-redirect-sanitized `returnTo`), `.../callback`
  (session cookie + state-cookie clear, locale-aware error redirect) and
  `GET /v1/auth/oauth/links`. Tests in `tests/oauth-routes.test.ts` use an
  injected provider (13 tests across both new files are part of the suite).
- **Auth policy**: a linked identity signs in; a new identity creates an account
  with an unusable password sentinel; a Google email matching an existing
  password account is auto-linked only after the verified-email policy change in
  continuation #13. `--reset-password` still works for password accounts.
- **Web**: the login/signup panel queries availability at runtime and shows a
  disabled button plus honest copy when unconfigured; the link/sign-in flow is a
  top-level redirect (no token in the URL). Account settings gained a Google
  section (connected / connect / unavailable + success notice). The OAuth error
  notice and success notice read query params inside Suspense so the pages stay
  statically prerenderable under `cacheComponents`.
- **Config/copy**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_OAUTH_REDIRECT_URI`, `API_PUBLIC_URL`, `WEB_APP_URL`,
  `OAUTH_STATE_SECRET`; setup steps in OPERATIONS.md; new keys in all seven
  locales.

### Verification
- API: 181 tests passed (1 skipped), typecheck and build pass.
- Web: 165 tests passed, typecheck, ESLint and `next build` pass (including the
  previously failing prerender of `/[locale]/account/settings`).
- Browser: `/zh/login` shows the disabled Google button with
  "此部署尚未配置 Google 登录"; `/zh/account/settings` shows the Google section
  with the same honest state; `/v1/auth/oauth/google/status` returns
  `{"google":false}` and `/start` returns 503.

### Requires the user (blocker for a live sign-in)
- A Google Cloud OAuth **Web application** client (Client ID + Secret) and the
  registered redirect URI. Nothing is fabricated in the meantime.

## 2026-10-23 GLM continuation #13 (live Google test → verified-email linking)

### What happened
- The user supplied a real Google OAuth Web client; the API now reports
  `{"google":true}`, and `/start` redirects to `accounts.google.com` with the
  correct client, redirect URI, S256 challenge and nonce. Google accepts the
  client.
- The first live "Continue with Google" hit the deliberate `email_exists` guard
  because `xiongfh2000@gmail.com` already has a password account — the intended
  friction of the no-auto-link policy, but not what the user wanted.

### Change (at the product owner's request)
- A **verified** Google email now links to the existing account with that email
  on first Google sign-in and signs in as that user (same credits/creations).
  Google's `email_verified` assertion is still enforced; suspended accounts are
  rejected; an account already bound to a DIFFERENT Google identity is rejected
  with `?oauthError=google_already_linked`; the explicit session-bound link flow
  remains. `email_exists` is retained only as a race-path fallback.
- New error copy in seven locales; `tests/oauth-routes.test.ts` now asserts the
  auto-link and the second-identity rejection (14 OAuth tests total).

### Verification
- API OAuth tests: 14 passed; typecheck passes.
- The running API was restarted with the real credentials; `status` is
  `{"google":true}` and the settings page shows the enabled "绑定 Google"
  button.
- **Superseded by #14:** the auto-link policy was reverted per the phase-2
  security specification, and no live consent round-trip was completed here.

## 2026-10-23 GLM continuation #14 (phase-2 OAuth audit and hardening)

### Audit
- Reviewed `business/oauth.ts`, `business/routes.ts`, `business/auth.ts`,
  `middleware/auth.ts`, `config/env.ts`, `app.ts`, the web auth panels, the
  OAuth tests and OPERATIONS.md against the 13 phase-2 checks. Callback route,
  server-only secrets, PKCE/state/nonce, JWKS/claims, `sub` binding,
  `email_verified`, token-free redirects, returnTo allowlisting, unique
  account/wallet creation, authenticated-only linking and logout invalidation
  all hold.
- Two non-compliances were found and fixed: (1) the temporary verified-email
  auto-link from #13 violated "不自动合并"; (2) `OAUTH_STATE_SECRET` fell back to
  `IMAGE_URL_SECRET`/a built-in default.

### Fixes
- Restored the strict policy: an existing email → `email_exists`, explicit
  session-bound link only. Added distinct `google_identity_taken` /
  `google_already_linked` conflict reasons and seven-locale copy.
- `resolveOAuthOptions` now requires an independent `OAUTH_STATE_SECRET`
  (≥32 chars, differs from `IMAGE_URL_SECRET`) whenever Google is configured;
  startup fails otherwise. Generated a 32-byte secret into `apps/api/.env`
  without printing it.
- Implemented scenario-E return paths: `?next=` on Header/Studio/Credits/
  Account/Orders login links, client-side `safeNextPath`, localized Google
  `returnTo`, and post-password-login navigation.
- Tests: 24 OAuth-specific (routes 12, provider 7, config 5), including
  no-auto-link, cross-account identity claim, logout invalidation, expired
  state, provider outage, suspended user, independent state secret and custom
  returnTo.

### Verification
- API: 192 tests passed, 1 skipped; typecheck and build pass.
- Web: 169 tests passed; typecheck, ESLint and `next build` pass.
- Running services: API 4000 reports `{"google":true}`; Web 3100 serves the
  login page with the enabled Google button.
- Live Google authorization (scenarios A/B/C/D/E/F) remains **pending the
  owner's manual consent**; no success is claimed.
- Full report: `docs/codex/GOOGLE-OAUTH-REPORT.md`.

## 2026-10-23 GLM continuation #15 (AI Studio P0 investigation)

### Reproduction
- Reproduced the full user flow in the browser as a signed-in password user:
  style → size → prompt → confirm → async job → preview.
- The chain succeeded: Job `5bd2d284…` POST `202`, worker claimed and
  succeeded in 63 ms, 79,211-byte PNG, job GET `200`, image GET `200`, wallet
  stayed 200 (mock releases), My Creations showed the work.
- A second, reference-image data-URI job (`6728bfdb…`) also reached
  `succeeded`; the reference-image **fusion quality** was not validated.
- Conclusion: the reported failure was **not reproducible** with a valid
  session; the app does not require Google sign-in.

### Real defects found and fixed
- **Edit endpoint**: `FAL_EDIT_ENDPOINT` pointed at `.../klein/4b/edit`, but the
  official model is `.../klein/4b/base/edit`. Real image-to-image would fail;
  the mock path hid it. Tests now import the production constant.
- **Confirm label**: `generator.confirm` was missing in all locales, so the
  dialog button rendered the raw key. Added seven translations.
- **Stale FE04-A gate**: `CREDITS_SERVICES`/`currentCreditsGate` still hardcoded
  all-false and their tests asserted it. The Studio already used a runtime
  gate; removed the dead constants and updated tests.
- **Diagnostics**: job creation logs `jobId/credits/mock`; the worker logs
  `claimed/succeeded/failed` with jobId, attempt, errorCode, bytes and mime.
  No prompt/reference/key/cookie is logged. UI now maps `STORAGE_FAILED`,
  `UPSTREAM_TIMEOUT`, `UPSTREAM_ERROR`, `RATE_LIMITED` and `CONFLICT` to
  distinct copy.

### Verification
- API: 195 passed, 1 skipped (28 files); typecheck and build pass. New
  `fal-provider` tests lock the official endpoints/payload; the edit payload
  uses `image_urls`.
- Web: 171 passed (22 files); typecheck, ESLint and build pass. New
  `generation-error` mapping tests.
- Browser: T2I and reference-data-URI mock jobs; My Creations cloud list;
  wallet unchanged at 200.
- Real fal.ai: not configured (`FAL_KEY` absent, `FAL_MOCK=1`). No paid call
  was made. Minimal single-call plan (≈$0.0046 at 1280×720) awaits approval.
- Full report: `docs/codex/STUDIO-P0-REPORT.md`.

## 2026-10-23 GLM continuation #16 (real-AI preflight)

### Added safety controls
- `business/provider-mode.ts`: `FAL_MOCK` → mock; `FAL_LIVE_ENABLED` + `FAL_KEY`
  → live; a key alone → disabled. Shared by API, embedded worker, worker CLI and
  sync route. `EMBED_WORKER=1` with no provider fails before opening PGlite.
- `GENERATION_PAUSED=1`: async job creation 503 + worker claims nothing; pricing
  reports `paused`.
- Platform daily budget: `PLATFORM_DAILY_COST_LIMIT_MICROS` (0 = hard stop)
  locked/reserved in the job transaction; tests cover 1-allowed/2nd-rejected and
  zero.
- Live retry protection: `attempt > 1` in live mode fails as
  `UPSTREAM_UNCERTAIN` without a second provider call (credits released, possible
  cost retained).
- Honest UI: runtime mock-mode notice in the Studio; mock badges in My
  Creations; live `/v1/creations` filters `_mock`; `generationMode`/`paused` in
  pricing; new error mappings.

### Verification
- API: 206 passed, 1 skipped (29 files); typecheck and build pass.
- Web: 171 passed (22 files); typecheck, ESLint and build pass.
- Browser: Studio shows “当前为模拟生成模式…”; My Creations shows 6 “模拟”
  badges; wallet 200; no real provider calls (log scan: 0 fal domains).
- Current env: `FAL_MOCK=1`, no `FAL_KEY`, no `FAL_LIVE_ENABLED`, no platform
  budget/pause; pricing reports `{"generationMode":"mock","paused":false}`.
- No paid fal.ai call was made. Real validation and production gaps are listed in
  `docs/codex/REAL-AI-PREFLIGHT-REPORT.md`.

## 2026-10-23 GLM continuation #17 (Studio + Credits UI/UX)

### Design process
- Read the official UI UX Pro Max, Anthropic frontend-design and Vercel
  web-interface-guidelines documents; no project-level UI skill existed and no
  global CLI/package was installed.
- Captured baseline screenshots at 1440/1280/820/390/360 for both pages. The
  IAB screenshot backend failed (`activity capture failed for guest`), so visual
  verification used headless Edge via CDP with the authenticated local session.

### Changes
- Studio: 1320px workspace, 5fr/7fr columns, 505px form / ~700px preview @1440,
  sticky preview, prompt before device via flex order, 6 style cards + browse
  all, two inspiration examples + expand, recent 8-item My Library with “View all
  in My Creations”, larger preview/typography, Header aligned to the page.
- Credits: 1120px; overview (available/reserved/estimated generations/price
  basis), packages (estimated generations, per-credit unit price, objective
  “best price per credit”), history filters and internal grouping, order
  `<details>` with refresh feedback, FAQ accordion.
- API: read-only wallet `reserved` and transaction `reservedDelta`; Studio uses
  available (balance − reserved) for its gate. No ledger/payment logic changed.
- New copy in seven locales; web/API tests updated.

### Verification
- API: 206 passed, 1 skipped; TypeScript and build pass.
- Web: 171 passed; TypeScript, ESLint and build pass.
- 42 locale/page/viewport checks (7 locales × 2 pages × 3 viewports): 0 raw
  keys, 0 overflow, 0 NaN/undefined; message key sets match.
- Browser: post-redesign Mock generation succeeded (image + Mock note, wallet
  200); internal filter shows reservation/mock events; order details expand; FAQ
  expands; no horizontal scroll at 360/390.
- Screenshots: `docs/codex/screenshots/baseline-*` and `final-*`.
- Full report: `docs/codex/STUDIO-CREDITS-UIUX-REPORT.md`.

## 2026-10-23 GLM continuation #18 (homepage UI/UX + conversion)

### Information architecture
- Hero: two-path subtitle (free gallery / AI Studio), both CTAs verified, height
  capped at `min(88svh, 48rem)` so the style band peeks into the first screen.
- Image de-duplication: marquee now uses 10 styles absent from the style
  navigation and featured grid (hero/demo removed); featured reduced from 12 to 8
  non-signature artworks; style navigation is six compact tiles, not a third
  gallery. Automated check: zero image overlap between hero/demo, marquee,
  featured and styles.
- Removed the unsupported "Trending this week" claim; the band is now a neutral
  style showcase.
- Style tiles show name, description and a visible Studio link; `?style=<id>`
  preselection verified in the browser.
- Studio intro: reference-photo copy no longer promises success; phone frame
  reduced for balance; section spacing tightened.
- How/Why: three-step flow kept; Why reduced from four cards to three text-band
  reasons with the honesty label merged into the curated-gallery copy; card-heavy
  layout replaced to vary rhythm.
- Final CTA offers both paths (Studio + gallery); signed-in header no longer
  shows a redundant Get Started next to Account.
- Featured adds the license-review note; all 39 gallery artworks remain
  review-pending (launch blocker for public/commercial use).

### Verification
- Web: 175 passed (23 files, +4 homepage invariants); TypeScript, ESLint and
  `next build` pass. API unchanged (last full run: 206 passed, 1 skipped).
- 21 home locale/viewport checks (7 locales × 3 viewports): 0 raw keys, 0
  overflow, 0 NaN/undefined; message key sets match.
- 5 viewports: no horizontal overflow; 1 eager hero image, 35 lazy images;
  one H1 and six H2s; hero/style/featured/CTA hrefs verified; signed-in header
  shows Account without a duplicate Get Started.
- Screenshots: `baseline-home-*` and `final-home-*` plus section captures.
- Full report: `docs/codex/HOMEPAGE-UIUX-REPORT.md`.

## 2026-10-24 GLM continuation #19 (global Header navigation/menu)

### Navigation
- Signed-out: Logo / Explore Wallpapers / AI Studio / language / Log in /
  Create Wallpaper. Signed-in: Logo / Explore Wallpapers / AI Studio / My
  Creations / language / real Credits / avatar menu (My account, Account
  settings, Credits & billing, Log out).
- Removed the standalone Account link and the duplicate Get Started. Desktop
  signed-in has no Create CTA; mobile keeps one primary Create entry; no Create
  CTA on `/studio` in either auth state. FAQ/About/Contact/Privacy/Terms remain
  Footer-only.
- Active route now uses `aria-current="page"` plus a pill/dot (nav, Credits chip
  and account-menu items). Logo hit area, link contrast, hover/focus and the
  sticky header's top gradient were strengthened.
- Responsive: full nav at ≥1280px; 640–1279px uses the menu, with Credits +
  Create when signed in; <640px keeps Logo + Create + hamburger. Mobile menu
  contains nav, user identity, Credits, account links, language and logout.

### Credits, auth and accessibility
- The header reads the existing `GET /v1/credits/wallet` and shows spendable
  credits (total − reserved), never a hardcoded number. Loading shows `…` with
  `aria-busy`; failure shows `—` and an unavailable label; a 401/session expiry
  drops the account menu. Balances refresh on load, route change and window
  focus/visibility.
- Account menu is a keyboard menu (arrow/Home/End, Escape with focus return,
  outside press, focus-out close) and never fabricates an avatar. Log out uses
  the existing endpoint and clears Header state immediately; failure shows a
  `role="alert"` message instead of pretending success.
- Login links still use `loginHref(pathname)`; `/studio` → `/login?next=%2Fstudio`
  verified. Google OAuth, session validation, wallet accounting, reservations,
  settlement and payment logic were not modified.
- Mobile touch targets are 44–48px for the hamburger, Create, language trigger
  and menu rows; language menu items are 44px. Switching language closes the
  mobile panel.
- Seven-locale nav/CTA copy added; all seven locale routes and header destinations
  return 200; de-DE at 360px has no horizontal overflow. Nested Escape was
  verified in the browser: the first Escape closes the language dropdown, the
  second closes the mobile panel.

### Verification
- Web: **185 passed / 24 files**, including 10 new Header tests; TypeScript,
  ESLint and `next build` pass (414 pages).
- Browser: real local session showed 200 backend Credits; account menu, Studio
  active state, Explore/My Creations active states, mobile menu and language
  switch verified. Logout in a disposable headless session updated the header in
  153ms and the server returned `null` for the session. Credits loading/error and
  wallet-401 expiry are covered by the Header DOM suite.
- Screenshots: `header-signed-in-*` and `header-signed-out-*` in
  `docs/codex/screenshots/` (1440/1280/820/390/360, account menu, Studio, both
  mobile menus, German 360).
- Report merged into `docs/codex/HOMEPAGE-UIUX-REPORT.md` §16.
- No Git writes, deployment, paid AI call, OAuth change or wallet/payment change.

### Known limits
- Wallet sync is load/navigation/focus driven; a generation completed while the
  user stays on the current page does not push a balance event to the header.
- Header static HTML is the signed-out skeleton until the client session probe
  resolves (HttpOnly cookie architecture), so a brief signed-out flash remains.
- Credits loading/error and expired-cookie visuals were verified by DOM tests,
  not separate screenshots.











## 2026-10-24 GLM continuation #20 (live wallpapers + anime style system)

### Delivered (Phase A, mock-safe MVP)
- Studio now has Static / Live mode switch. Static remains mounted and its
  existing form, generation, history and favorites are unchanged. The live
  mode shares the same account, styles, device model, Credits and async job
  pipeline (not a separate video system).
- Live MVP: text-to-video (3/4/5s) and image-to-video (5s) from an owned image
  or upload; style, scene, motion prompt, device/ratio, provider-limited
  duration, backend price, confirmation, asynchronous job, poster/video
  preview, loop/mute/play-pause, MP4 download and platform limitations.
- Style system: dedicated Anime & Manga category, existing anime styles
  upgraded/reused (anime, shonen, shoujo, chibi, cozy-anime, retro-cel, mecha,
  manga, ukiyo-e, horror-anime), new anime-fantasy, chinese-ink, 3d-cartoon;
  46 total styles. Static and video prompt builders, style motion metadata and
  seven-locale labels/descriptions all resolve.
- Video jobs extend generation_jobs/media assets with media type, generation
  mode, duration, source creation, poster and metadata (migration 005). Worker
  selects image/video adapter, extends video leases to 900s, and refuses a
  re-claimed live attempt without a second provider call.
- Signed private video/poster URLs with GET/HEAD and single Range, correct MP4
  MIME and download disposition. My Creations supports image/video filters,
  playback, download, cloud delete and “create again”; public Gallery only
  shows an honest empty Live state (no auto-publishing).
- Backend-owned video pricing: I2V 5s 40 Credits; T2V 3/4/5s 40/50/60 Credits;
  cost bounds $0.50/$0.50/$0.65/$0.80. Mock jobs release their hold; live jobs
  capture/release through the existing wallet.
- Live provider candidates verified against fal docs: Wan 2.2-5B I2V ($0.15,
  5s, 720p, 9:16/16:9/1:1) and Kling v3 Standard T2V ($0.084/s audio off,
  3–15s). Live adapters and queue payloads are tested with injected fetch only.
  `FAL_VIDEO_LIVE_ENABLED` is an independent, default-off opt-in in addition
  to `FAL_LIVE_ENABLED` + `FAL_KEY`; no real video request was made.
- Mock assets: browser-generated silent H.264 MP4s for 3/4/5s × 9:16/16:9/1:1
  with PNG posters; not presented as real AI output.

### Verification
- API: 220 passed, 2 skipped (33 files); TypeScript and build pass (assets
  copied to dist).
- Web: 190 passed (25 files); TypeScript, ESLint and `next build` pass (414
  pages). Contracts typecheck pass.
- Browser 1440×900 / 820×1180 / 390×844: static generation regression, static
  → live draft transfer, mock T2V 5s, mock I2V from own creation, video playback
  (`4.9968s`, muted, loop, playsInline), My Creations video filter and Gallery
  Live empty state.
- New API tests cover pricing, I2V/T2V, unsupported durations, live capture,
  failure release, budget spent, lease reclaim without a second call, private
  video Range/HEAD, poster and signed downloads.
- Screenshots: `live-*`, `final-live-*`, `gallery-live-*` in
  `docs/codex/screenshots/`.
- Full report: `docs/codex/LIVE-WALLPAPER-UPGRADE-REPORT.md`.

### Known limits
- Real Wan/Kling video calls are not verified; no paid request was made.
- T2V live has no poster (Kling returns video only); I2V 3/4s and Kling I2V
  are not implemented; no seamless-loop processing or Live Photo export.
- Production object storage/streaming Range and production PostgreSQL/multi-
  worker verification remain external blockers; local storage is base64 JSON.
- Public Live Gallery awaits asset/privacy/content review; user videos stay
  private and are never auto-published.
- Video pricing/cost bounds are technical proposals awaiting owner approval.
- No Git commit/push, deployment, real payment, real AI or OAuth change.

## 2026-10-24 GLM continuation #21 (static/live wallpaper experience + device adaptation)

### Delivered
- Studio primary flow: type → default valid style (anime) → optional
  description → automatic device fit → Generate. Empty descriptions are valid
  when a style is selected; the homepage generator keeps its no-default behavior.
- One collapsed Advanced group holds device, ratio, resolution, custom size,
  inspiration and reference image. Values survive collapse; one reset restores
  the screen recommendation without overwriting style/prompt/motion.
- Live Studio gets the same flow, an explicit “animate my image” entry, an
  automatic device/provider-ratio recommendation, and a real self-authored
  5-second demo preview with demo selector instead of a blank gradient.
- Static detail page now uses the file's real width/height (no fixed 3:4 box,
  bars, crop or stretch), shows dimensions/native-device/download-original
  metadata, and adds a clearly labelled CSS-only device preview.
- Measured all 39 static presets; added native phone/tablet/desktop helpers and
  actual-ratio cards. Gallery has All/Static/Live and All/Phone/Tablet/Desktop
  filters; "All devices" sorts preferred-device media first without hiding others.
- Added six real silent 5s H.264 MP4 demos + posters (`public/videos/live-demos/`),
  each labelled "motion demo / not AI output" with style, duration, pixels,
  ratio and native device.
- Fixed LiveVideoPlayer falsely reporting "video unavailable" when play() was
  interrupted; only a real media error marks the player failed.
- Added all missing keys in 7 locales and kept key parity.

### Verification
- Web: **206 passed / 29 files**; TypeScript, ESLint and `next build` pass.
- API: **220 passed / 2 skipped / 33 files**; TypeScript pass.
- Contracts typecheck pass.
- Browser: detail and Studio/Gallery at 1440×900, 1280×800, 820×1180,
  390×844 and 360×800. Detail before/after captured; no ratio bars after fix.
- Real demo playback verified: duration 5, loop true, muted true, paused false,
  currentTime wrapped from >5s back to 1.04s, `video.error` null.
- Empty prompt + default style reached the confirmation dialog and showed
  “style template only”; no generation was submitted.
- Screenshots: `docs/codex/screenshots/device-wallpaper/`.
- Full report: `docs/codex/DEVICE-WALLPAPER-REPORT.md`.

### Known limits
- No static tablet-native wallpaper exists yet, so the static tablet filter is an
  honest empty state; no crop/pad variant is presented as native.
- IAB can change viewport but not `screen`/DPR/`maxTouchPoints`; real phone/tablet
  touch classification still needs a physical-device check.
- Real Wan/Kling calls, production object storage/Range and public live gallery
  remain blocked/unauthorized as before. No paid AI, Git writes or deployment.


## 2026-10-24 GLM continuation #22 (motion quality, 30-day lifecycle, mainstream styles, device gallery)

### Delivered
- Replaced the six simple procedural motion demos with **eight 5s silent
  H.264 MP4 demos** built from licensed CC0 photos + local camera/particle
  overlays: sakura, neon rain, deep-space nebula, jellyfish, aurora, sunset
  station, forest light, flower field. Posters are local JPEGs.
- Gallery motion section is now one hero preview + 2×2 showcase + remaining
  grid on desktop, and one hero + horizontal recommendation strip on mobile.
  Only one player exists; playback is muted, inline, looping and user-initiated.
- Static Gallery is grouped by real native device (desktop 3 columns, tablet 4,
  phone 5 on desktop) with actual ratios; media type and device share one top
  toolbar. Added 9 tablet-native 3:4 and 9 desktop-native 16:9 wallpapers
  (16 CC0 photo sources + 2 self-authored procedural abstractions).
- Detail pages show verified CC0 source/author/license, dimensions/ratio,
  native device and original-download note; legacy review-pending assets keep
  the legal warning. Metadata title no longer calls licensed photos “AI”.
- 30-day lifecycle: migration 006 adds completedAt/expiresAt/retentionPolicy/
  storageStatus/deleteAttempts/deletedAt and `media_cleanup_runs`. New completes
  get 30 days; existing rows stay `legacy` with NULL expiry. Signed URLs,
  downloads and creation responses reject/hide expired media. Cleanup is
  idempotent, retries failed object deletes, records every pass, and never
  touches legacy/official/ledger/order data.
- Ops media sweep is **dry-run by default**; actual deletion requires
  `MEDIA_RETENTION_CLEANUP_ENABLED=1` plus `STORAGE_DIR`. No existing work has
  been deleted and no irreversible sweep was enabled.
- My Creations shows the new-creation 30-day policy and per-card days-left/
  expiry/expired states; Studio success panels show the download-before-expiry
  notice.
- Added eight missing mainstream styles: Starry Galaxy, Mountain Lake, Deep
  Ocean, Aurora Nights, Architecture Minimal, Macro Nature, Soft Gradient,
  Abstract Light. Each has seven-language labels/descriptions, a real licensed
  or self-authored preview, a static prompt template and motion guidance.

### Verification
- Web: **214 passed / 31 files**; TypeScript, ESLint and `next build` pass.
- API: **225 passed / 2 skipped / 34 files**; TypeScript pass. New lifecycle
  tests cover exact 30-day interval, expired list/signed-URL/download rejection,
  dry-run non-deletion, idempotent cleanup, failed-delete retry, legacy
  protection and unchanged ledger rows.
- Contracts typecheck pass.
- Browser: 1440×900, 1280×800, 820×1180, 390×844, 360×800. Demo playback
  reports 5s duration, loop/muted true and no media error; 8 demo cards exist
  and the hero switches to Sakura with exactly one `<video>`.
- Screenshots: `docs/codex/screenshots/gallery-quality-upgrade/`.
- Source/license record: `docs/codex/MEDIA-SOURCES.md`.

### Known limits
- The proposed “floating island” theme was not shipped: no licensed
  high-quality source was available, and a low-quality procedural placeholder
  was deliberately rejected. It needs approved real AI video or new licensed
  assets.
- School-life/four-season previews were not fabricated from unrelated photos;
  existing nearby styles remain. No AI-generated media was produced.
- Actual media deletion is not enabled. Production R2/S3 lifecycle and
  multi-worker PostgreSQL verification remain external blockers.
- Real AI image/video calls, Git writes, deployment and payments were not
  performed.
