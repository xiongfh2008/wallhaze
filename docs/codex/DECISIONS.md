# Decisions

## 2026-10-21 (Codex)
- User's autonomous execution and explicit no-Git-write instructions supersede skill approval/commit/worktree defaults. Work directly in authorized paths and document checkpoints.
- PostgreSQL with explicit parameterized SQL via node-postgres is preferred for this slice over adding an ORM abstraction: lock ordering, ledger consistency and migrations stay auditable. Drizzle was evaluated as a candidate, not a requirement; no existing ORM to preserve.
- Test migrations on PGlite (actual PostgreSQL WASM engine) in isolated memory. It cannot establish multi-process/multi-connection server lock behavior; prepare opt-in disposable server tests and retain that launch gate.
- Independent Fastify owns opaque sessions and credential hashing with Node crypto scrypt; host-only secure cookies in production, no bearer tokens in browser storage, no OAuth auto-linking. Better Auth/Auth.js remain integration alternatives; avoiding adding OAuth surfaces without credentials keeps account ownership explicit. Security review and verified email recovery remain deployment gates if not implemented.
- AI execution is asynchronous and owned by API worker CLI, independent of Next.js. Preserve upstream style/size validation. Never automatically retry potentially billed timed-out calls; fence stale workers and conservatively retain possible provider cost.
- Payment adapter remains provider neutral. Mock checkout and signed simulated notifications are development/test-only and never enabled in production. Real provider configuration is an external verification gate.
- Unreviewed Gallery licenses and legal drafts block publication/launch. Do not assert commercial rights from remote image URLs.

## 2026-10-21 (GLM continuation)
- **Wallet semantics:** `balance` is the TOTAL credit balance; `reserved` is the portion already held for
  running jobs, so spendable = balance − reserved (enforced by `reserved <= balance`). Reserve adds only
  `reserved`; capture decrements both; release decrements only `reserved`. This matches the tested contract and
  avoids the impossible "reserve then capture" state under the DB check constraint.
- **Schema was still unreleased** (no production database, no deployed migration), so the drift between
  `001_core.sql` and the Codex test contract was resolved by renaming in the migration rather than weakening
  tests: `wallets` → `credit_wallets`, job columns → `request/credits/cost_micros`.
- **Receipt-first webhooks:** every notification is durably inserted as `received` in its own transaction before
  money moves; processing is a nested transaction and `retryReceived()` replays anything left behind. Signatures
  are verified over the RAW request bytes, captured by the app-level JSON parser (`request.rawBody`) because
  Fastify forbids a child scope from re-registering `application/json`.
- **CSRF layering:** cookie sessions are `HttpOnly; SameSite=Lax`; every browser WRITE additionally requires an
  exact allowlisted `Origin` (when present) and the `X-WallHaze-Client: web` header. Reads rely on the cookie
  alone — requiring the custom header on GETs broke legitimately simple fetches and adds no CSRF value.
- **Private images use signed URLs** (`?exp=&sig=` HMAC, 1h TTL) in addition to owner-checked cookie access.
  Reason: `<img>` subresources are cross-site requests where SameSite cookies are not sent, so a cookie-only
  image route would fail in any web/API split-origin deployment. Signed URLs are bearer capabilities (like
  presigned S3 links); the API still re-derives ownership from the asset before serving.
- **Studio submit is gate-driven at request time.** The gate is loaded from real session/pricing/wallet probes;
  any failed probe closes it and the confirm dialog then shows no submission control. The previous hardcoded
  `CREDITS_SERVICES === false` constant is no longer consulted by the submit path.
- **No working "buy Credits" button** is exposed while only the mock PSP exists: opening a
  `checkout.mock.invalid` URL would be a dead end. Packages and orders are listed from the backend; checkout
  stays gated until a real sandbox is configured.
- **History URL validation** now accepts absolute `http(s)` URLs (not only https) so local/test API origins can
  persist; `data:`/relative values remain rejected. Mixed content is enforced by the browser, not this check.

## 2026-10-21 (Waffo Pancake integration)
- **Adapter owns parsing.** Signature schemes differ per provider (HMAC for mock, RSA-SHA256 for Waffo), so
  `PaymentAdapter.parseWebhook(raw, signature)` returns a neutral `{id, kind, orderId, paymentId, amountMinor,
  currency}`. The ledger/order code never branches on a provider.
- **Order correlation uses `orderMerchantExternalId`** (our internal order id, also mirrored in
  `metadata.orderId`). Waffo does not return our id at session creation, so without this channel the webhook
  could not identify the order. It is inherited by order/payment/refund events.
- **Compare the PRE-TAX subtotal.** Our package prices are pre-tax; Waffo's `listPrice.total`/`chargedAmount`
  include tax. Amounts are display strings, converted with the currency exponent (0/2/3 decimals), and
  over-precision is rejected.
- **Environment is enforced twice:** the SDK verifies with the test or prod key only, and the event `mode` must
  equal `PAYMENT_ENVIRONMENT`. A test event can never settle a production order.
- **Product mapping is explicit.** `payment_products` is populated by `waffo:setup --apply`; checkout fails with
  SERVICE_UNAVAILABLE when a package has no product. This avoids implicit product creation during a user click
  and makes the mapping auditable. `--publish` (prod) is refused in the test environment.
- **Production refuses the mock adapter.** With a database configured and `PAYMENT_PROVIDER != waffo`,
  production boot fails. Honest failure beats silently accepting fake payments.
- **PGlite file-backed DB for local dev only.** `PGLITE_DIR` enables the whole checkout flow without Docker;
  it is a single-process database and is explicitly ignored when `DATABASE_URL` is set and refused under
  `NODE_ENV=production`.
- **Secrets live only in `apps/api/.env`** (gitignored). The merchant private key is never logged, never sent to
  the web app, and never written into source or documentation.

## 2026-10-21 (split-origin session debugging)
- CORS must advertise `Access-Control-Allow-Credentials: true` for the exact allowlisted origin; without it the
  browser discards credentialed responses and cannot store the session cookie. The allowed header list must
  include every custom header the client sends (`X-WallHaze-Client`, `Idempotency-Key`), otherwise preflights
  fail before the request is ever sent.
- Cookies are host-scoped: local development must use `localhost` for BOTH web and API (different ports are
  fine, same site). `127.0.0.1` and `localhost` are distinct sites for cookie purposes.
- `NEXT_PUBLIC_*` values are build-time constants. A production `next start` without the variable during
  `next build` will render the intentionally disabled auth panel; this is correct behavior, not a login bug.

## 2026-10-22 (local PGlite lifecycle for the second corruption incident)
- **Graceful stop is a feature, not an operator habit.** PGlite has no crash-safe WAL recovery; a hard kill can
  destroy the only local database. A dev-only `POST /internal/shutdown` (guarded by a random
  `OPS_SHUTDOWN_TOKEN`, never registered in production) lets `npm run stop` tear down the worker, Fastify and
  the database in order and write a backup. SIGINT/SIGTERM handlers remain for terminals that deliver them.
- **Probe before opening.** A corrupt WAL aborts the PGlite WASM instance, so the guard opens the directory in a
  child process first. Only explicit corruption signals (`PANIC`, `Aborted()`, checkpoint/resource-manager
  errors, probe exit 3) trigger quarantine + backup restore. Infrastructure failures (loader missing, timeout,
  EACCES/ENOENT) are "unavailable" and block startup instead of destroying a possibly healthy database.
- **Never delete local evidence.** Corrupt directories are renamed to `<dir>-corrupt-<timestamp>`; backups keep
  the last three. If a Windows handle blocks the rename, the guard fails with instructions rather than
  overwriting.
- **Ops tools must work on the dev database.** `ops.ts` previously required `DATABASE_URL`, which is why the
  first local recovery needed an ad-hoc script. It now opens PGlite when that is the configured database,
  refuses to run while the API serves `/health`, and provides `--ensure-user`, `--reset-password`, `--grant`,
  `--wallet` and `--unlock`.
- **`--ensure-user` never resets an existing password** (recovery must not silently change credentials), and
  `--reset-password` revokes every session and clears the login throttle in the same transaction.

## 2026-10-21 (payment reconciliation and account deletion removal)
- **Pull-based verification is a first-class path, not a test hack.** Webhooks cannot reach a local
  deployment and can lag in production; returning from checkout therefore triggers
  `POST /v1/payments/orders/:id/sync`, which asks the provider and applies the same normalized event as a
  webhook. The ledger/webhook-event dedup makes both paths safe to run in any order.
- **The success URL carries the internal order id.** It is appended server-side after the order exists,
  because the client cannot know it before checkout creation.
- **Pending checkouts are reused.** Repeated clicks create duplicate provider orders otherwise. An order for
  the same user+package created within an hour is reused, returning its stored hosted-session URL while it is
  unexpired; an expired session is recreated for the SAME internal order.
- **Waffo GraphQL uses `String!` for ids** — `ID!` yields `Unknown type "ID"`. Provider calls are bounded by
  a 12 s timeout; an unbounded SDK call was observed hanging for 141 s.
- **Account deletion is intentionally not offered.** The prior request/cancel flow was removed at the user's
  request; the table remains (forward-only migration) but is unused. Financial records were always retained.

References checked: https://docs.waffo.ai/zh/integrate/skill ; `@waffo/pancake-ts@0.26.0` type definitions
(`CheckoutSessionResult`, `WebhookEventData`, `verifyWebhook`).

References checked: https://node-postgres.com/features/transactions ; https://pglite.dev/docs/api ; https://pglite.dev/docs/about ; https://fastify.dev/docs/latest/Reference/ContentTypeParser/ .

## 2026-10-23 (real-generation preflight: fail-closed switches)
- **A FAL_KEY alone never enables paid traffic.** Real calls require
  `FAL_LIVE_ENABLED=1` (or `true`) AND a non-empty key; `FAL_MOCK=1` always wins.
  The selection lives in `provider-mode.ts` and is shared by the API, the
  embedded worker, the worker CLI and the sync route. `EMBED_WORKER=1` without a
  provider refuses to boot before opening the dev database.
- **Two spend gates, not one.** Per-user and platform daily cost budgets are
  locked and reserved in the same transaction as the job; the platform limit
  accepts 0 as a hard stop. Each job reserves the conservative cost bound
  ($4) rather than the estimated model price, so budgets never under-reserve.
- **Live lease re-claims do not call the provider again.** A real-mode job with
  `attempt > 1` (previous worker may have reached fal.ai) fails as
  `UPSTREAM_UNCERTAIN`: user credits are released, the possible cost stays in
  the budget's spent column, and no second paid call is made. Mock retries remain
  free for tests. The trade-off is an uncertain job that needs operator review
  instead of an automatic retry.
- **Pause is enforced on both sides.** `GENERATION_PAUSED=1` refuses async job
  creation with 503 and prevents the worker from claiming anything; the pricing
  endpoint exposes `paused` so the Studio closes its gate before submitting.
- **Mock is always labeled and never mixed into live libraries.** The Studio
  shows a runtime mock-mode notice (plus the post-result note), My Creations
  labels mock assets, and `/v1/creations` filters `_mock` jobs when the API runs
  in live mode. Mock completion releases the reservation instead of capturing.
- **Known production gaps are explicit:** actual provider width/height are not
  persisted in the async pipeline; storage is local-disk only; there is no
  scheduled orphan sweep; multi-worker PostgreSQL is unverified.

## 2026-10-23 (AI Studio P0: endpoints, gates, diagnostics)
- **The official endpoints are `fal-ai/flux-2/klein/4b` for text-to-image and
  `.../base/edit` for reference-image editing.** The edit path had drifted to
  `/edit`; mock tests could not catch it because the mock provider never calls
  fal. Tests now import the production constants and assert both paths plus the
  `image_urls` payload, so a future drift fails CI.
- **There is no static "services enabled" gate.** `CREDITS_SERVICES` (always
  false) and `currentCreditsGate()` were leftovers from FE04-A and could
  silently block every generation if someone wired them back in. The Studio's
  only gate consumes runtime facts (session, server price, wallet) and the
  backend remains authoritative.
- **Failure diagnostics are job-scoped and non-sensitive.** Job creation and
  worker transitions log `jobId`, phase, attempt, error class, byte size and
  mime — never prompts, reference images, keys, cookies or tokens. The UI maps
  `STORAGE_FAILED` / `UPSTREAM_TIMEOUT` / `UPSTREAM_ERROR` / `RATE_LIMITED` /
  `CONFLICT` to distinct copy instead of a generic failure.
- **Mock success is not real generation.** The mock image is a valid PNG but
  no model was called and no Credits were captured. A real fal.ai validation
  requires a `FAL_KEY` and an approved single-call budget; it is not implied by
  the green mock E2E tests.

## 2026-10-23 (Google sign-in)
- **Server-side Authorization Code + PKCE, no browser tokens.** The web only
  starts a top-level navigation to the API; the API holds the client secret, the
  PKCE verifier, the nonce and the ID token, and sets the same opaque session
  cookie as password login. No OAuth token ever reaches `localStorage`, a URL or
  the web bundle.
- **No verified-email auto-linking (final).** A Google identity whose email
  matches an existing password account does NOT take over that account. The
  callback reports `email_exists`; the user signs in with the password and uses
  the session-bound explicit link flow. The auto-link behavior briefly enabled
  during the first live test was reverted in the phase-2 audit because the
  security requirement is explicit: identity binding must be initiated by an
  authenticated account, never inferred from an email match. One identity maps
  to at most one account (`UNIQUE(provider, provider_account_id)`); a second
  account cannot claim an identity (`google_identity_taken`) and an account
  cannot hold two Google links (`google_already_linked`).
- **The OAuth state secret is independent and mandatory.** The state cookie is
  signed with `OAUTH_STATE_SECRET`, which must be a random ≥32-character secret
  distinct from `IMAGE_URL_SECRET`. Startup fails when Google is configured and
  the secret is missing, short, or equals the image secret — there is no
  fallback to another key or a built-in default. This removes the previous
  `IMAGE_URL_SECRET` fallback.
- **State lives in a signed cookie, not a table.** The cookie carries `state`,
  the PKCE verifier, the nonce and the sanitized `returnTo` in one HMAC-signed
  value with a 10-minute TTL. It works identically on PGlite and PostgreSQL,
  needs no migration, and is self-contained across API instances. It is
  HttpOnly, SameSite=Lax and path-scoped to `/v1/auth/oauth`.
- **Verify the ID token properly.** RS256 signature against Google's JWKS
  (cached one hour, refetched once for an unknown key), then issuer, audience,
  expiry with 60 s skew, nonce and `email_verified`. A token from the token
  endpoint is not trusted on transport alone.
- **Capability is runtime, never build-time.** `/v1/auth/oauth/google/status`
  tells the web whether credentials exist; the button enables only then. Adding
  credentials requires an API restart, not a web rebuild or a code change.
  Without credentials the API answers 503 and the UI states it plainly.
