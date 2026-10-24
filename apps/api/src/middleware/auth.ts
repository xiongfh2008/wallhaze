import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../business/auth.js";
import { AppError } from "../errors/app-error.js";

/**
 * Session authentication for the independent Fastify backend (R03).
 *
 * The opaque session token lives ONLY in an HttpOnly cookie — it never
 * reaches browser storage or logs (the logger redacts cookie headers).
 * Resolved identity is attached to `request.user` for the handler; any
 * failure is a stable UNAUTHENTICATED envelope, never a leak of why.
 */

export const SESSION_COOKIE = "wh_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface AuthenticatedRequest extends FastifyRequest {
  user: { id: string; email: string | null; displayName: string | null };
}

/** Reads one cookie value; null when absent or malformed. */
export function readCookie(
  request: FastifyRequest,
  name: string
): string | null {
  const header = request.headers.cookie;
  if (typeof header !== "string" || header.length === 0) return null;
  for (const part of header.split(";")) {
    const [cookieName, ...rest] = part.trim().split("=");
    if (cookieName === name && rest.length > 0) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function readSessionToken(request: FastifyRequest): string | null {
  return readCookie(request, SESSION_COOKIE);
}

/** Serialized session cookie — also used when combining Set-Cookie headers. */
export function sessionCookieValue(
  token: string,
  options: { secure: boolean }
): string {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(options.secure ? ["Secure"] : []),
  ];
  return attributes.join("; ");
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  options: { secure: boolean }
): void {
  reply.header("set-cookie", sessionCookieValue(token, options));
}

export function clearSessionCookieValue(options: { secure: boolean }): string {
  const attributes = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(options.secure ? ["Secure"] : []),
  ];
  return attributes.join("; ");
}

export function clearSessionCookie(reply: FastifyReply, options: { secure: boolean }): void {
  reply.header("set-cookie", clearSessionCookieValue(options));
}

/** Builds the pre-handler that guards every authenticated route. */
export function authGuard(auth: AuthService) {
  return async (request: FastifyRequest): Promise<void> => {
    const token = readSessionToken(request);
    const session = token ? await auth.session(token) : null;
    if (!session) {
      throw new AppError("UNAUTHENTICATED", "Sign in to continue");
    }
    (request as AuthenticatedRequest).user = session.user;
  };
}
