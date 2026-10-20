import type { FastifyInstance } from "fastify";

export interface HealthRouteOptions {
  version: string;
}

/** GET /health — liveness/readiness probe used by local ops and tests. */
export async function healthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions
): Promise<void> {
  app.get("/health", async () => ({
    status: "ok" as const,
    service: "wallhaze-api" as const,
    version: options.version,
    timestamp: new Date().toISOString(),
  }));
}
