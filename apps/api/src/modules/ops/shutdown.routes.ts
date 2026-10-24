import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors/app-error.js";

/**
 * Development-only graceful stop endpoint (POST /internal/shutdown).
 *
 * PGlite is single-process and can be corrupted by a hard kill, so local
 * restarts must not use taskkill. `npm run stop` sends the token from
 * OPS_SHUTDOWN_TOKEN; the server then stops the worker, closes the app,
 * closes the database (which writes a backup) and exits.
 *
 * Registered only when NODE_ENV !== "production" AND a token is configured.
 * The token is compared with timing-safe digests of both sides.
 */

export interface OpsRoutesOptions {
  token: string;
  onShutdownRequested: (source: string) => void;
}

function safeEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function opsRoutes(
  app: FastifyInstance,
  options: OpsRoutesOptions
): Promise<void> {
  app.post("/internal/shutdown", async (request, reply) => {
    const provided = request.headers["x-ops-token"];
    if (typeof provided !== "string" || !safeEqual(provided, options.token)) {
      throw new AppError("UNAUTHENTICATED", "Invalid ops token");
    }
    reply.code(202).send({ ok: true, stopping: true });
    // Let the response flush before the process starts tearing down.
    setTimeout(() => options.onShutdownRequested("ops-token"), 100);
  });
}
