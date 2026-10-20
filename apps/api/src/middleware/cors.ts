import type { FastifyInstance } from "fastify";
import { errorEnvelope } from "../errors/app-error.js";

export interface CorsPluginOptions {
  /** Exact origins allowed to call this API from a browser. */
  allowedOrigins: readonly string[];
}

/**
 * Origin-whitelist CORS (T04-S1).
 *
 * - Only exact matches from CORS_ALLOWED_ORIGINS are echoed into
 *   Access-Control-Allow-Origin; unknown origins get NO CORS header at all,
 *   so browsers block the response. No wildcard, ever.
 * - Non-browser / same-origin requests (no Origin header) pass untouched.
 * - Preflight (OPTIONS) is answered by a single catch-all route: 204 for
 *   allowed origins, 403 otherwise.
 */
export async function corsPlugin(
  app: FastifyInstance,
  options: CorsPluginOptions
): Promise<void> {
  const allowed = new Set(options.allowedOrigins);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin || !allowed.has(origin)) return;
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
    reply.header("Access-Control-Max-Age", "600");
  });

  app.route({
    method: "OPTIONS",
    url: "/*",
    handler: async (request, reply) => {
      const origin = request.headers.origin;
      if (!origin || !allowed.has(origin)) {
        return reply
          .status(403)
          .send(errorEnvelope("FORBIDDEN", "Origin is not allowed."));
      }
      return reply.status(204).send();
    },
  });
}
