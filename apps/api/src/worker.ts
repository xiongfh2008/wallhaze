import { loadEnv, loadEnvFile } from "./config/env.js";
import { createPostgresDatabase, type Database } from "./db/database.js";
import { migrate } from "./db/migrate.js";
import { startWorker } from "./business/worker.js";
import { FalJobProvider } from "./business/providers.js";
import { MockJobProvider } from "./business/providers.js";
import { createFalProvider, createMockProvider } from "./modules/generation/fal.provider.js";
import { LocalStorage, MemoryStorage } from "./business/storage.js";
import { PromptModerationService } from "./business/moderation.js";
import { OutputModerationService } from "./business/output-moderation.js";
import { resolveStorageFromEnv } from "./business/r2-storage.js";
import {
  isFlagEnabled,
  isVideoLiveAllowed,
  resolveGenerationMode,
} from "./business/provider-mode.js";
import { randomUUID } from "node:crypto";
import {
  createLiveVideoProviders,
  createMockVideoProviders,
} from "./modules/generation/video.providers.js";

/**
 * Generation worker CLI (R05). Owns the lease-protected execution of
 * queued jobs against the SAME database the API writes. Run:
 *   node --import tsx src/worker.ts
 *
 * Provider selection mirrors app.ts: FAL_MOCK=1 → in-process mock (never
 * touches the network), FAL_KEY → real fal.ai provider, otherwise the
 * worker refuses to start rather than silently idling.
 */
async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv(process.env);
  if (!env.DATABASE_URL) {
    console.error("[worker] DATABASE_URL is required");
    process.exit(1);
  }
  const generationMode = resolveGenerationMode(env);
  const provider =
    generationMode === "mock"
      ? new MockJobProvider()
      : generationMode === "live" && env.FAL_KEY
        ? new FalJobProvider(
            createFalProvider({ fetchImpl: fetch, falKey: env.FAL_KEY })
          )
        : undefined;
  if (!provider) {
    console.error(
      "[worker] no provider enabled — set FAL_MOCK=1, or FAL_LIVE_ENABLED=1 together with FAL_KEY"
    );
    process.exit(1);
  }
  const videoProviders =
    generationMode === "mock"
      ? createMockVideoProviders()
      : isVideoLiveAllowed(env)
        ? createLiveVideoProviders({ falKey: env.FAL_KEY!, fetcher: fetch })
        : undefined;
  const db: Database = createPostgresDatabase(env.DATABASE_URL);
  await migrate(db);
  const storage = resolveStorageFromEnv(env, () =>
    env.STORAGE_DIR ? new LocalStorage(env.STORAGE_DIR) : new MemoryStorage()
  );
  const moderation = new PromptModerationService({
    merchantId: env.WAFFO_MERCHANT_ID ?? null,
    privateKey: env.WAFFO_PRIVATE_KEY ?? null,
    endpoint: env.WAFFO_MODERATION_ENDPOINT,
    semantic: env.WAFFO_MODERATION_SEMANTIC,
    reviewMaxWaitMs: env.WAFFO_MODERATION_REVIEW_MAX_WAIT_SECONDS
      ? env.WAFFO_MODERATION_REVIEW_MAX_WAIT_SECONDS * 1000
      : undefined,
    reviewRetryDelayMs: env.WAFFO_MODERATION_REVIEW_RETRY_INTERVAL_SECONDS
      ? env.WAFFO_MODERATION_REVIEW_RETRY_INTERVAL_SECONDS * 1000
      : undefined,
  });
  const outputModeration = new OutputModerationService({
    apiKey: env.OUTPUT_MODERATION_API_KEY ?? null,
    endpoint: env.OUTPUT_MODERATION_ENDPOINT,
    model: env.OUTPUT_MODERATION_MODEL,
    frames: env.OUTPUT_MODERATION_FRAMES,
  });
  const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  console.log(`[worker:${workerId}] started (poll=${env.WORKER_POLL_MS ?? 2000}ms, lease=${env.WORKER_LEASE_SECONDS ?? 300}s)`);
  const handle = startWorker(
    db,
    {
      provider,
      videoProviders,
      storage,
      moderation,
      outputModeration,
      generationMode,
      leaseSeconds: env.WORKER_LEASE_SECONDS,
      mock: generationMode === "mock",
      paused: isFlagEnabled(env.GENERATION_PAUSED),
      log: (event) => console.log(JSON.stringify(event)),
    },
    workerId,
    env.WORKER_POLL_MS
  );
  const shutdown = async (): Promise<void> => {
    console.log(`[worker:${workerId}] draining...`);
    await handle.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((error) => {
  console.error("[worker] fatal:", error);
  process.exit(1);
});
