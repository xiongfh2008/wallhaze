import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors/app-error.js";

/**
 * RESERVED authentication pre-handler (T04-S2+).
 *
 * Not attached to any route in T04-S1 — exported so the wiring point is
 * explicit. Once an auth provider is chosen, this hook must verify the
 * session/token and attach the user identity to the request before any
 * authenticated route handler runs.
 */
export async function requireAuth(
  _request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  throw new AppError(
    "UNAUTHENTICATED",
    "Authentication is not wired up yet (planned for T04-S2+)."
  );
}
