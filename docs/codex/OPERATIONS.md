# Operations and deployment notes (R08)

Written 2026-10-21. Everything here is a *plan*; nothing was deployed.

## Processes

| Process | Command | Notes |
|---|---|---|
| API | `npm run start` (after `npm run build`) | Serves only public routes when `DATABASE_URL` is unset; business routes require it and run migrations on boot |
| Worker | `npm run worker` | Requires `DATABASE_URL` + `FAL_MOCK=1` or `FAL_KEY`; refuses to start otherwise. Run exactly one or many — claims use `FOR UPDATE SKIP LOCKED` |
| Ops | `npm run ops` | Sweeps stale leases (30 min), applies retention cleanup (auth attempts >24 h, processed webhook events >90 d, canceled deletion requests >30 d), replays `received` webhooks and reconciles every wallet against the ledger; exit code 2 on mismatch. Flags: `--no-sweep`, `--no-cleanup`, `--no-replay` |
| Web | `npm run build && npm run start` in `apps/web` (port 3100) | Needs `NEXT_PUBLIC_API_BASE_URL` pointing at the API |

## Required production configuration

1. `DATABASE_URL` — PostgreSQL with backups; migrations run on API boot.
2. `IMAGE_URL_SECRET` — required in `NODE_ENV=production` (boot fails without it).
3. `CORS_ALLOWED_ORIGINS` — exact web origin(s); also the checkout redirect allowlist.
4. `NEXT_PUBLIC_API_BASE_URL` — public API origin for the web app.
5. HTTPS in front of both processes; session cookies are marked `Secure` when an https origin is configured.
6. A real payment provider — **not implemented**; the mock adapter must not take money.

## Security posture

- Sessions: opaque token in an `HttpOnly; SameSite=Lax` cookie; only the sha256 hash is stored.
- Writes: exact `Origin` match (when present) + `X-WallHaze-Client: web`; JSON bodies only.
- Private images: HMAC-signed URLs (1 h) or owner cookie; signed URLs are bearer capabilities.
- Ledger: append-only, DB trigger blocks UPDATE/DELETE; wallet row locked per mutation.
- Worker leases: token + expiry + attempt fencing; stale workers are rejected with 409.
- Webhooks: signature over raw bytes; events recorded before money moves; replay endpoint.
- Logs redact `authorization` and `cookie` headers.

## Backup and recovery

- Take PostgreSQL base backups + WAL archiving; the ledger is the source of truth and is immutable.
- Restore procedure (not exercised here): restore database → run `npm run ops -- --no-sweep` → investigate any mismatch before serving traffic.
- Image storage is external to the database. For `LocalStorage` deployments back up `STORAGE_DIR`; ensure it has the same retention as `generation_jobs` rows.
- `rollbackEmptyDatabase()` is a developer tool only; it refuses to run on a database containing users.

## Account deletion

A user can record a deletion request in Settings. The API stores it in `account_deletion_requests`, revokes
all sessions and clears the cookie; the user can cancel it by signing in again. **Execution is manual**: the
credit ledger is append-only and orders/payments are retained for accounting, so a purge must be designed as
anonymization (retain financial rows, remove profile data) and performed by an operator. No automatic purge
runs in this build.

## Payments (Waffo Pancake)

| Command | Purpose |
|---|---|
| `npm run waffo:check` | Read-only: verifies merchant credentials and that `WAFFO_STORE_ID` is visible |
| `npm run waffo:setup` | Dry run: shows each active package, its price and current product mapping |
| `npm run waffo:setup -- --apply` | Creates missing TEST products and writes `payment_products` |
| `npm run waffo:setup -- --apply --publish` | Prod only: publishes the products |
| `npm run waffo:setup -- --webhook-url https://api.example/v1/payments/webhook` | Registers `order.completed` + `refund.succeeded` |

Required variables: `PAYMENT_PROVIDER=waffo`, `PAYMENT_ENVIRONMENT=test|prod`, `WAFFO_MERCHANT_ID`,
`WAFFO_STORE_ID`, `WAFFO_PRIVATE_KEY` (PEM or raw base64, server-only). The private key must never reach the web
app or logs. `PAYMENT_PROVIDER=mock` is refused under `NODE_ENV=production`.

Order correlation: checkout sends our order id as `orderMerchantExternalId` (and `metadata.orderId`); webhook
events echo it back. Credits are granted only after `order.completed` passes signature verification, the
environment check and an amount match on the PRE-TAX subtotal. Refunds reverse the same credits.

Return-from-checkout: `successUrl` receives `?order=<internal id>`; the Credits page calls
`POST /v1/payments/orders/:id/sync`, which queries Waffo (`payments` by external id, then `onetimeOrder`) and
applies the same idempotent event as a webhook. This is the fallback when webhooks cannot reach the deployment;
register the webhook for production so payments still settle when the buyer never returns.

## Local development without PostgreSQL

`PGLITE_DIR=.data/pglite-dev` makes the API use a file-backed PGlite database (single process). It is
ignored when `DATABASE_URL` is set and refused under `NODE_ENV=production`.

Because PGlite is single-process, a separate worker cannot open the same data directory. Set
`EMBED_WORKER=1` to run the worker loop inside the API process (development only). Production uses PostgreSQL
plus a separate `npm run worker`.

### Stop and restart (never force-kill)

**Use `npm run stop` to stop the local API.** It calls the dev-only `POST /internal/shutdown` endpoint with
`OPS_SHUTDOWN_TOKEN` from `apps/api/.env`; the server stops the embedded worker, closes Fastify, closes PGlite
and writes a backup before exiting. `OPS_SHUTDOWN_TOKEN` must be set in `.env` (the endpoint is not registered
without it, and never in production).

A hard kill (`taskkill /F`, Task Manager, closing a crashed terminal) can leave `postmaster.pid` plus an invalid
WAL checkpoint and make the directory unopenable (`PANIC: could not locate a valid checkpoint record`).
SIGINT/SIGTERM are still handled, but on Windows they are not reliably delivered to background processes.

### Startup guard, backups and recovery

- On boot the database is opened through `src/db/pglite-guard.ts`. A child process probes it first, so a corrupt
  directory aborts the probe instead of the API. Probe failures that are NOT corruption (missing tsx loader,
  timeout, ENOENT/EACCES) are reported as errors and never cause quarantine.
- Every graceful close writes `.data/pglite-dev-backups/<timestamp>/` (last 3 kept, lock file stripped).
- If the probe reports corruption, the directory is renamed to `.data/pglite-dev-corrupt-<timestamp>` (never
  deleted) and the newest backup is restored; with no backup the API starts an empty database.
- Two API processes must never open one PGlite directory. Startup refuses when `/health` already answers on
  `PORT`, and `npm run ops` refuses while the API is running.
- If a directory cannot be renamed because a Windows process still holds a handle (EPERM), stop all API
  processes and point `PGLITE_DIR` at a new directory; the locked directory is preserved in place.

### Ops CLI (works with PGlite and PostgreSQL)

Stop the API first when using PGlite, then:

| Command | Effect |
|---|---|
| `npm run ops` | sweep stale jobs, retention cleanup, webhook replay, wallet reconciliation |
| `npm run ops -- --unlock <email>` | clear failed-login counters for one email |
| `npm run ops -- --ensure-user <email>` | create the account if missing; prints a generated password once |
| `npm run ops -- --reset-password <email>` | generated password, revokes all sessions, clears lockout |
| `npm run ops -- --grant <email> <credits>` | add credits (ledger reason `ops.grant`, requires an existing account) |
| `npm run ops -- --wallet <email>` | print credits/reserved/debt |

Targeted commands skip the maintenance run. `--ensure-user` never changes an existing password.

### Local data-loss incident (2026-10-22)

The first PGlite directory was corrupted by a hard kill on 2026-10-21; the replacement
`.data/pglite-fresh` was corrupted the same way during the following restart. Its WAL was unrecoverable
(`invalid resource manager ID`, `invalid checkpoint record`). The account/wallet in it were lost again; recovery
used `--ensure-user` + `--grant 200` against the new `.data/pglite-dev`, and `npm run waffo:setup -- --apply`
recreated the `payment_products` mappings (new test products were created because the previous mapping table was
lost). Both corrupt directories are preserved under `apps/api/.data/` (renaming was blocked by a Windows file
lock). Production data was never affected. From now on use `npm run stop`.


## Google sign-in (OAuth 2.0)

Server-side Authorization Code flow with PKCE. The browser only ever sees
Google's consent screen and an opaque `wh_session` cookie; the client secret and
ID token stay in the API. Without credentials the feature is visibly disabled —
the API reports `{ "google": false }`, the login button is disabled, and
`GET /v1/auth/oauth/google/start` returns 503. Nothing is simulated.

### Enable it

1. Google Cloud Console → APIs & Services → OAuth consent screen. Choose
   External, add your own account under **Test users** while the app is in
   testing, and add the scopes `openid`, `email`, `profile`.
2. Credentials → Create credentials → OAuth client ID → **Web application**.
3. Add the exact redirect URI:
   - local: `http://localhost:4000/v1/auth/oauth/google/callback`
   - production: `https://api.<domain>/v1/auth/oauth/google/callback`
4. Put the values in `apps/api/.env` and restart the API (`npm run stop`,
   then `npm run start`). The web needs no rebuild: availability is fetched at
   runtime from `/v1/auth/oauth/google/status`.

| Variable | Required | Meaning |
|---|---|---|
| `GOOGLE_CLIENT_ID` | yes | `....apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | yes | server-only; never sent to the web |
| `GOOGLE_OAUTH_REDIRECT_URI` | recommended | must match the console exactly; defaults to `${API_PUBLIC_URL}/v1/auth/oauth/google/callback` |
| `API_PUBLIC_URL` | prod | public API base used to build the default redirect URI |
| `WEB_APP_URL` | recommended | where the browser returns after login; defaults to the first CORS origin (`http://localhost:3100`) |
| `OAUTH_STATE_SECRET` | yes (when Google is configured) | Independent HMAC secret for the state cookie. Required in every environment; must differ from `IMAGE_URL_SECRET` and be ≥32 chars. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Startup fails if missing/invalid — there is no fallback. |

### Account linking policy

- A Google identity already bound in `auth_accounts` signs straight in.
- An unknown Google identity creates a NEW account (verified email, unusable
  password sentinel).
- A verified Google email that already belongs to a WallHaze password account is
  **not merged automatically** (`?oauthError=email_exists`): the user signs in
  with the password and starts the explicit link flow from Account Settings.
  This is the final policy (phase-2 security requirement); automatic merging was
  briefly enabled during the first live test and reverted.
- The explicit link flow requires the current session at the start AND at the
  callback. An identity already bound to another account is rejected
  (`?oauthError=google_identity_taken`); an account that already has a Google
  link is rejected (`?oauthError=google_already_linked`).
- `auth_accounts` enforces one identity per account and one account per identity
  (`UNIQUE(provider, provider_account_id)`).

### Security properties

- `state` is random and stored in a signed, HttpOnly, SameSite=Lax cookie; the
  callback must echo it exactly (10-minute TTL).
- PKCE S256 binds the authorization code to this server-side flow.
- The ID token's RS256 signature is verified against Google's JWKS (cached 1 h),
  then issuer, audience, expiry, nonce and `email_verified` are checked.
- `returnTo` accepts only relative paths or an allowlisted web origin (the value
  is inside the signed cookie, so tampering is rejected).
- The state cookie is cleared on every callback path; no token ever appears in a
  URL, log line, or the web bundle.

### Limitation

No real Google client is configured in this repository, so a live Google
consent round-trip has not been executed. The full flow is covered by tests with
an injected provider (`apps/api/tests/oauth-routes.test.ts`) and by a locally
signed ID token/JWKS (`apps/api/tests/google-oauth.test.ts`).


## Real generation (paid) safety

- **Mode selection is fail-closed** (`apps/api/src/business/provider-mode.ts`):
  - `FAL_MOCK=1/true` → Mock (wins even when a key is present);
  - `FAL_LIVE_ENABLED=1/true` **and** a non-empty `FAL_KEY` → live;
  - otherwise disabled. A configured key alone never enables billing.
- `EMBED_WORKER=1` without a provider refuses to start (before opening PGlite).
- `GENERATION_PAUSED=1` makes async job creation return 503 and the worker
  claim nothing; no provider call can start.
- **Platform budget**: `PLATFORM_DAILY_COST_LIMIT_MICROS` (0 = hard stop) is
  checked/reserved in the same transaction as the job. Each job uses the
  conservative `costBoundMicros` ($4) for budget accounting.
- **Live retry protection**: a real-mode job reclaimed after its lease expired
  (`attempt > 1`) is failed as `UPSTREAM_UNCERTAIN` without a second provider
  call; credits are released and the possible cost is retained. Metrics/Mock
  jobs still re-run freely.
- **Mock is labeled**: the Studio shows a runtime mock-mode notice and the
  result note; My Creations labels mock works. In live mode, `/v1/creations`
  filters `_mock` jobs out of the cloud list.
- `/v1/credits/pricing` reports `generationMode` and `paused` so the UI can
  close the gate before a submit.

### Single real-call checklist (only after approval)

1. `FAL_KEY=...`, `FAL_MOCK=0`, `FAL_LIVE_ENABLED=1`,
   `PLATFORM_DAILY_COST_LIMIT_MICROS=4000000` (one $4 bound),
   optionally `USER_DAILY_COST_LIMIT_MICROS=4000000`.
2. `npm run stop` → `npm run start`; `/v1/credits/pricing` must show
   `"generationMode":"live"`, `"paused":false`.
3. One T2I call, 1280×720, no automatic retry; expected provider cost ≈
   $0.0046; 10 Credits captured on success.
4. Immediately set `GENERATION_PAUSED=1`, remove `FAL_KEY`/`FAL_LIVE_ENABLED`,
   restore `FAL_MOCK=1`, and restart.
5. Keep the Job ID, ledger row and the provider response id for reconciliation.

## Local sign-in requirements (important)

1. The web app must be BUILT or RUN with `NEXT_PUBLIC_API_BASE_URL` — it is inlined into the client bundle.
   `apps/web/.env.local` sets `http://localhost:4000`; run `next build` (or `next dev`) after changing it.
2. Open the site as `http://localhost:3100` and keep the API on `http://localhost:4000`. Cookies are host-bound
   and `localhost` ≠ `127.0.0.1` for the browser, so mixing the two makes the session cookie cross-site.
3. `CORS_ALLOWED_ORIGINS` must contain the exact web origin; the API sends
   `Access-Control-Allow-Credentials: true` for allowlisted origins and permits
   `Content-Type, X-Request-Id, X-WallHaze-Client, Idempotency-Key`.
4. The API must be running: without it the auth panel intentionally renders disabled (no fake login).

## Known operational gaps

- No scheduler/supervisor config is provided here; run the worker under systemd/PM2/container orchestration with restart-on-failure.
- No retention/cleanup job for soft-deleted creations (image bytes and `image_assets` rows are removed on delete; job metadata is kept).
- No independent PostgreSQL server test has been run (Docker unavailable); PGlite covers DDL and transaction semantics only.
- `generation_jobs.request` stores the validated request including a reference image data URI; consider a size limit or external blob storage before production.
- Rate limiting for auth endpoints is per (email, IP) bucket; add a network-level limiter at the edge.
- Local PGlite is still a single-machine development database. Its backups live next to it (last 3, local disk
  only) — treat local accounts/credits as disposable and use PostgreSQL for anything that must survive.
- Async jobs do not persist the provider's actual output width/height; the Studio displays the requested size.
  Add width/height columns and surface them before relying on metadata.
- No scheduled orphan-file sweep exists for the local image store; delete removes the asset, but a crashed
  write or manual file removal is not reconciled. Production object storage needs a lifecycle policy.
- `PLATFORM_DAILY_COST_LIMIT_MICROS` has no management UI/alerting; set it conservatively and monitor the
  `generation_budgets` platform row.
