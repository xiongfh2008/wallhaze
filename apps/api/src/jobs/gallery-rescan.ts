import { loadEnvFile, loadEnv } from "../config/env.js";
import { createPostgresDatabase, type Database } from "../db/database.js";
import { OutputModerationService } from "../business/output-moderation.js";
import { rescanPublishedGallery } from "../business/gallery-moderation.js";

/**
 * Scheduled gallery re-scan (AIGC compliance stage 3): fetches the
 * published-gallery manifest and re-screens every listed asset with the
 * output moderation service, writing one moderation_logs row per asset.
 * Requires OUTPUT_MODERATION_API_KEY and GALLERY_RESCAN_MANIFEST_URL —
 * without them the run exits non-zero (fail closed, nothing skipped).
 *
 * Run: node dist/<entry>/jobs/gallery-rescan.js   (daily loop service)
 */
async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv(process.env);
  if (!env.DATABASE_URL) {
    console.error("[gallery-rescan] DATABASE_URL is required");
    process.exit(1);
  }
  if (!env.OUTPUT_MODERATION_API_KEY) {
    console.error(
      "[gallery-rescan] OUTPUT_MODERATION_API_KEY is required — refusing to run unscreened"
    );
    process.exit(1);
  }
  if (!env.GALLERY_RESCAN_MANIFEST_URL) {
    console.error(
      "[gallery-rescan] GALLERY_RESCAN_MANIFEST_URL is required (published-assets manifest JSON)"
    );
    process.exit(1);
  }

  let db: Database | undefined;
  try {
    db = createPostgresDatabase(env.DATABASE_URL);
    const moderation = new OutputModerationService({
      apiKey: env.OUTPUT_MODERATION_API_KEY,
      endpoint: env.OUTPUT_MODERATION_ENDPOINT,
      model: env.OUTPUT_MODERATION_MODEL,
      frames: env.OUTPUT_MODERATION_FRAMES,
    });
    const result = await rescanPublishedGallery(db, {
      manifestUrl: env.GALLERY_RESCAN_MANIFEST_URL,
      moderation,
    });
    console.log(
      `[gallery-rescan] ok scanned=${result.scanned} allow=${result.allow} ` +
        `block=${result.block} unavailable=${result.unavailable}` +
        (result.flagged.length > 0 ? ` flagged=${result.flagged.join(",")}` : "") +
        (result.unscreenable.length > 0
          ? ` unscreenable=${result.unscreenable.join(",")}`
          : "")
    );
    if (result.block > 0) {
      // Visible, non-zero exit so the compose loop surfaces it in logs.
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(
      `[gallery-rescan] failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  } finally {
    await db?.close();
  }
}

main();
