# WallHaze V2.0 Implementation Plan

Date: 2026-10-21. Baseline: master / b8b7e026ddd1ff33cc49fcc0e28b996c098bdbe8.
Execution: autonomous continuation by GLM after Codex ran out of quota. No commits, no deployment.

## Global constraints
- Never access D:/Project/wallhaze/wallhaze. Never recursively scan repository root.
- Modify only apps/web, apps/api, packages/contracts, optional apps/worker, docs/codex.
- Preserve existing uncommitted work. No Git mutations, production access, paid calls, real payments, system configuration changes or port 3000 requests.
- Mock providers only in tests; explicitly distinguish embedded PostgreSQL tests from independent server concurrency validation.
- Keep cacheComponents:true, existing style/size rules and seven locales.

| Task | Status | Evidence |
|---|---|---|
| R00 audit | Done | scoped Git/code/test evidence in PROGRESS.md + R00-WEB.md |
| R01 existing FE04-FE09 + gaps | Done (audit P1/P2 fixed) | web 125 tests, typecheck, lint, build; honest unavailable states preserved |
| R02 schema/migration | Done | `001_core.sql`, `002_packages.sql`, checksummed multi-file migrator, PGlite DDL/rollback tests |
| R03 authentication | Done | scrypt hashing, hashed opaque cookies, expiry/revocation, persistent throttling, isolation tests |
| R04 ledger | Done | atomic ledger/wallet/reservations, idempotency, refund debt, reconciliation, immutability trigger |
| R05 jobs/worker/storage | Done | persisted budgets, lease fencing, recovery, private assets, no charge on storage failure |
| R06 payment adapters | Done (mock PSP only) | signed raw webhook, durable receipt/retry, neutral orders, idempotent crediting |
| R07 integration | Done (mock payment only) | register→purchase→generate→fail/release→download→isolation in API tests; Studio async jobs, auth forms, credits panel, cloud creations, account/orders all wired to the backend; purchase UI gated pending a real PSP |
| R08 launch preparation | Partial | builds/typecheck/lint/tests pass; OPERATIONS.md + .env.example; ops CLI (sweep + reconcile); real-service verification, retention jobs and legal review outstanding |

## Execution units (state)
- [x] Database and ledger — `src/db/*`, `migrations/*`, `src/business/wallet.ts`; tests `database.test.ts`, `wallet.test.ts`.
- [x] Auth/payment HTTP — `src/business/{auth,payment,routes}.ts`; tests `auth-business.test.ts`, `payment-business.test.ts`, `routes-business.test.ts`.
- [x] Async generation — `src/business/{jobs,worker,storage}.ts`, `src/worker.ts`; test `jobs.test.ts`.
- [x] Web integration — `lib/api/jobs.ts`, `lib/studio/{executor,restore}.ts`, `components/{auth/AuthPanel,credits/CreditsClient,credits/OrdersPanel,creations/CloudCreations,auth/AccountPanel}.tsx`, Studio submit path, My Creations fixes.
- [x] Ops surface — `src/business/maintenance.ts`, `src/ops.ts` (`npm run ops`), `docs/codex/OPERATIONS.md`.
- [ ] Remaining R07-R08 items — account deletion request, refunds UI, retention job, real PSP/object storage/AI verification.
- [ ] Independent PostgreSQL server verification — blocked (no Docker daemon, no credentials).

Tests are executed with the bundled Node and local Vitest/TypeScript. Never weaken application security for tests.
