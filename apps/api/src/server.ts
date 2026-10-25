import { buildApp } from "./app.js";
import { corsOriginList, loadEnv, loadEnvFile } from "./config/env.js";
import { createPostgresDatabase, type Database } from "./db/database.js";
import {
  assertDevDatabaseAvailable,
  closePgliteGuarded,
  openPgliteGuarded,
} from "./db/pglite-guard.js";
import { LocalStorage, MemoryStorage } from "./business/storage.js";
import { resolveStorageFromEnv } from "./business/r2-storage.js";
import { startWorker } from "./business/worker.js";
import { FalJobProvider, MockJobProvider } from "./business/providers.js";
import {
  isFlagEnabled,
  isVideoLiveAllowed,
  resolveGenerationMode,
} from "./business/provider-mode.js";
import { createFalProvider } from "./modules/generation/fal.provider.js";
import {
  createLiveVideoProviders,
  createMockVideoProviders,
} from "./modules/generation/video.providers.js";

/**
 * Production entry point for the standalone API.
 *
 * Local development runs an embedded worker because PGlite is a single-process
 * database: a separate worker process cannot open the same data directory.
 * Production uses PostgreSQL and a separate `npm run worker` process.
 *
 * Local PGlite opens through `pglite-guard`: a child-process probe detects a
 * corrupt WAL before this process touches it, backups are written on every
 * graceful close, and shutdown is available through `npm run stop`
 * (POST /internal/shutdown) so the database is never hard-killed.
 */
async function main(): Promise<void> {
  // Local development convenience; real environments provide variables
  // directly. Existing variables always win.
  loadEnvFile();
  const env = loadEnv();
  const pgliteDir =
    !env.DATABASE_URL && env.PGLITE_DIR && env.NODE_ENV !== "production"
      ? env.PGLITE_DIR
      : null;

  const generationMode = resolveGenerationMode(env);
  const isMock = generationMode === "mock";
  const generationPaused = isFlagEnabled(env.GENERATION_PAUSED);
  const jobProvider =
    generationMode === "mock"
      ? new MockJobProvider()
      : generationMode === "live" && env.FAL_KEY
        ? new FalJobProvider(
            createFalProvider({ fetchImpl: fetch, falKey: env.FAL_KEY })
          )
        : undefined;
  // Video adapters use the same explicit live opt-in as images. Constructing
  // them performs no network I/O; only an executing worker can call fal.ai.
  const videoProviders =
    generationMode === "mock"
      ? createMockVideoProviders()
      : isVideoLiveAllowed(env)
        ? createLiveVideoProviders({ falKey: env.FAL_KEY!, fetcher: fetch })
        : undefined;

  // A local embedded worker without a provider would accept jobs and never
  // process them (and could only ever be fixed by enabling billing). Fail
  // closed BEFORE opening the dev database.
  const databaseConfigured = Boolean(env.DATABASE_URL || pgliteDir);
  const embeddedRequested =
    isFlagEnabled(env.EMBED_WORKER) && databaseConfigured;
  if (embeddedRequested && !jobProvider) {
    throw new Error(
      "EMBED_WORKER=1 requires a generation provider — set FAL_MOCK=1, or FAL_LIVE_ENABLED=1 together with FAL_KEY"
    );
  }

  let database: Database | undefined;
  let activePgliteDir: string | null = null;
  if (env.DATABASE_URL) {
    database = createPostgresDatabase(env.DATABASE_URL);
  } else if (pgliteDir) {
    // Never open the single-process dev database while another API serves
    // the same directory.
    await assertDevDatabaseAvailable(env.PORT);
    const opened = await openPgliteGuarded(pgliteDir);
    database = opened.db;
    activePgliteDir = opened.dir;
    if (opened.repaired) {
      console.warn(
        "[pglite] the previous database could not be opened; it was preserved next to the new one (see .data/*-corrupt-*)"
      );
    }
  }

  // One storage instance shared by the HTTP routes and the worker.
  // STORAGE_DRIVER=r2 (fail-closed on missing credentials) wins over the
  // local-disk fallback; see r2-storage.ts.
  const storage = resolveStorageFromEnv(env, () =>
    env.STORAGE_DIR ? new LocalStorage(env.STORAGE_DIR) : new MemoryStorage()
  );

  let shuttingDown = false;
  let requestShutdown: ((source: string) => void) | null = null;

  const { app } = await buildApp({
    env: process.env,
    database,
    storage,
    generationMode,
    generationPaused,
    videoProviders,
    opsShutdownToken: env.OPS_SHUTDOWN_TOKEN,
    onShutdownRequested: (source) => requestShutdown?.(source),
  });

  const embedded = embeddedRequested && jobProvider !== undefined;
  const worker = embedded
    ? startWorker(
        database!,
        {
          provider: jobProvider!,
          videoProviders,
          storage,
          generationMode,
          mock: isMock,
          paused: generationPaused,
          leaseSeconds: env.WORKER_LEASE_SECONDS,
          log: (event) => app.log.info(event),
        },
        "embedded",
        env.WORKER_POLL_MS ?? 2_000
      )
    : null;

  const closeDatabase = async (): Promise<void> => {
    if (!database) return;
    if (activePgliteDir) await closePgliteGuarded(database, activePgliteDir);
    else await database.close();
  };

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "Received shutdown signal — closing gracefully");
    try {
      // Stop consuming new jobs before the database closes.
      if (worker) await worker.stop();
      await app.close();
      await closeDatabase();
    } catch (error) {
      app.log.error({ err: error }, "Graceful shutdown failed");
    } finally {
      process.exit(0);
    }
  };
  requestShutdown = (source) => void shutdown(source);

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      `wallhaze-api listening on ${env.HOST}:${env.PORT} — CORS origins: ${
        corsOriginList(env).join(", ") || "(none)"
      }${embedded ? ` — embedded worker (${isMock ? "mock" : "fal"})` : ""}${
        pgliteDir ? " — PGlite dev database (npm run stop for a clean exit)" : ""
      }`
    );
  } catch (error) {
    app.log.error({ err: error }, "Failed to start the API server");
    // Close the dev database cleanly: leaving it open here would hand the
    // next start a half-written directory.
    if (worker) await worker.stop().catch(() => undefined);
    await app.close().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error("[api] fatal:", error);
  process.exit(1);
});
