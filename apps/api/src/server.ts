import { buildApp } from "./app.js";
import { corsOriginList, loadEnv } from "./config/env.js";

/**
 * Production entry point for the standalone API. Not started automatically
 * in T04-S1 — run explicitly with `npm run dev` (tsx watch) or
 * `npm run build && npm start`.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const { app } = await buildApp({ env: process.env });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Received shutdown signal");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      `wallhaze-api listening on ${env.HOST}:${env.PORT} — CORS origins: ${
        corsOriginList(env).join(", ") || "(none)"
      }`
    );
  } catch (error) {
    app.log.error({ err: error }, "Failed to start the API server");
    process.exit(1);
  }
}

void main();
