/** Credentialed backend adapter. Missing API configuration returns unavailable. */

import { apiRequest, resolveApiBaseUrl, type ApiResult } from "./client";

/** Proposed user shape for the future Auth API (not yet a backend contract). */
export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Proposed session shape — opaque token handling stays server-side later. */
export interface AuthSession {
  user: AuthUser;
  /** ISO 8601 expiry, or null when the backend manages lifetime opaquely. */
  expiresAt: string | null;
}

/**
 * Service gate. Flipping this to true is part of the future Auth backend
 * integration — never from UI code, never to fake a signed-in state.
 */
export const AUTH_SERVICES_CONFIGURED = Boolean(resolveApiBaseUrl());

function unavailable<T>(): ApiResult<T> {
  return { ok: false, failure: { kind: "unavailable" }, status: null };
}

/** Aggregate auth status derived from the session — single UI-facing shape. */
export type AuthStatus =
  | { state: "authenticated"; user: AuthUser }
  | { state: "unauthenticated" }
  | { state: "unavailable" };

export interface OAuthCapability {
  /** True only when the backend has Google client credentials configured. */
  google: boolean;
}

export interface AuthAdapter {
  /** null data means "no active session" (only meaningful when configured). */
  getSession(): Promise<ApiResult<AuthSession | null>>;
  getCurrentUser(): Promise<ApiResult<AuthUser | null>>;
  /** Reserved: password sign-in. Credentials are discarded while gated. */
  signInWithPassword(email: string, password: string): Promise<ApiResult<AuthSession>>;
  /** Reserved: password registration. Credentials are discarded while gated. */
  signUpWithPassword(email: string, password: string): Promise<ApiResult<AuthSession>>;
  /** Reserved: Google OAuth redirect flow (code exchange happens server-side). */
  signInWithGoogle(): Promise<ApiResult<AuthSession>>;
  /** Whether the backend can actually start a Google flow (never assumed). */
  getOAuthStatus(): Promise<ApiResult<OAuthCapability>>;
  /** Providers already linked to the signed-in account. */
  getOAuthLinks(): Promise<ApiResult<OAuthCapability>>;
  signOut(): Promise<ApiResult<null>>;
}

class GatedAuthAdapter implements AuthAdapter {
  async getSession(): Promise<ApiResult<AuthSession | null>> {
    // Future integration point: GET the session from the Auth API via
    // apiRequest (cookies carried server-side, never localStorage tokens).
    return apiRequest("/v1/auth/session");
  }

  async getCurrentUser(): Promise<ApiResult<AuthUser | null>> {
    return (async () => { const r = await authAdapter.getSession(); return r.ok ? { ok: true, data: r.data?.user ?? null } : r; })();
  }

  async signInWithPassword(
    _email: string,
    _password: string
  ): Promise<ApiResult<AuthSession>> {
    return apiRequest("/v1/auth/login", { method: "POST", body: { email: _email, password: _password } });
  }

  async signUpWithPassword(
    _email: string,
    _password: string
  ): Promise<ApiResult<AuthSession>> {
    return apiRequest("/v1/auth/signup", { method: "POST", body: { email: _email, password: _password } });
  }

  async signInWithGoogle(): Promise<ApiResult<AuthSession>> {
    return unavailable<AuthSession>();
  }

  async getOAuthStatus(): Promise<ApiResult<OAuthCapability>> {
    return apiRequest("/v1/auth/oauth/google/status");
  }

  async getOAuthLinks(): Promise<ApiResult<OAuthCapability>> {
    return apiRequest("/v1/auth/oauth/links");
  }

  async signOut(): Promise<ApiResult<null>> {
    return apiRequest("/v1/auth/logout", { method: "POST", body: {} });
  }
}

/** App-wide singleton. Tests may construct their own GatedAuthAdapter. */
export const authAdapter: AuthAdapter = new GatedAuthAdapter();

/**
 * Absolute API URL that starts the Google redirect flow. The API redirects
 * to Google and back to `returnTo` on the web origin; the session cookie is
 * set server-side, so no token ever travels through the URL. Null when the
 * API base URL is not configured (the button must stay disabled).
 */
export function oauthStartUrl(
  mode: "signin" | "link",
  returnTo: string
): string | null {
  const base = resolveApiBaseUrl();
  if (!base) return null;
  const params = new URLSearchParams({ returnTo });
  if (mode === "link") params.set("mode", "link");
  return `${base}/v1/auth/oauth/google/start?${params.toString()}`;
}

/** Derives the UI-facing status; never fabricates an authenticated state. */
export async function getAuthStatus(adapter: AuthAdapter = authAdapter): Promise<AuthStatus> {
  const result = await adapter.getSession();
  if (!result.ok) {
    return { state: "unavailable" };
  }
  if (result.data === null) {
    return { state: "unauthenticated" };
  }
  return { state: "authenticated", user: result.data.user };
}
