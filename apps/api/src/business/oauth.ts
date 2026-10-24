import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import { AppError } from "../errors/app-error.js";

/**
 * Google OAuth 2.0 (Authorization Code + PKCE) provider and OAuth state.
 *
 * Security properties:
 * - the browser never sees the client secret or the ID token;
 * - PKCE (S256) binds the authorization code to this server-side flow;
 * - `state` is random, stored in a signed HttpOnly cookie AND echoed by
 *   Google, so a callback from another browser/session is rejected;
 * - `nonce` binds the returned ID token to this flow;
 * - the ID token signature is verified against Google's JWKS, then the
 *   issuer, audience, expiry, nonce and `email_verified` claims are checked;
 * - no email-based auto-linking (see DECISIONS.md): an identity is only
 *   attached to an existing account through an explicit link flow.
 */

export const OAUTH_STATE_COOKIE = "wh_oauth_state";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthIdentity {
  provider: "google";
  /** Google `sub` — stable per Google account, never the email. */
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
}

export interface OAuthAuthorizeInput {
  state: string;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface OAuthExchangeInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  nonce: string;
}

export interface OAuthProvider {
  readonly configured: boolean;
  authorizationUrl(input: OAuthAuthorizeInput): string;
  exchangeCode(input: OAuthExchangeInput): Promise<OAuthIdentity>;
}

export interface OAuthStatePayload {
  state: string;
  verifier: string;
  nonce: string;
  /** Relative web path (`/zh/account`) or an allowlisted absolute URL. */
  returnTo: string;
  mode: "signin" | "link";
  /** Present only for mode=link: the account the identity is bound to. */
  userId?: string;
  /** Epoch milliseconds. */
  exp: number;
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

export function signOAuthState(
  secret: string,
  payload: OAuthStatePayload
): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** Verifies the signature and shape; expiry is checked by the caller. */
export function verifyOAuthState(
  secret: string,
  token: string
): OAuthStatePayload | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (expected.length !== given.length) return null;
  if (!timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as OAuthStatePayload;
    if (
      typeof payload?.state !== "string" ||
      typeof payload?.verifier !== "string" ||
      typeof payload?.nonce !== "string" ||
      typeof payload?.returnTo !== "string" ||
      (payload.mode !== "signin" && payload.mode !== "link") ||
      typeof payload?.exp !== "number"
    ) {
      return null;
    }
    if (payload.mode === "link" && typeof payload.userId !== "string") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

const GOOGLE_AUTHORIZE_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const PROVIDER_TIMEOUT_MS = 12_000;
const JWKS_TTL_MS = 60 * 60 * 1000;
/** Tolerated clock skew for `exp` (seconds). */
const EXPIRY_SKEW_SECONDS = 60;

interface GoogleOAuthOptions {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  /** Overridable for tests; production uses the Google endpoints above. */
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
}

interface GoogleClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  nonce?: string;
}

interface GoogleTokenResponse {
  id_token?: unknown;
}

interface GoogleJwks {
  keys?: Array<Record<string, unknown> & { kid?: string }>;
}

export class GoogleOAuthProvider implements OAuthProvider {
  readonly configured = true;
  private jwks: { keys: Map<string, Record<string, unknown>>; expiresAt: number } | null =
    null;

  constructor(private readonly options: GoogleOAuthOptions) {}

  authorizationUrl(input: OAuthAuthorizeInput): string {
    const url = new URL(
      this.options.authorizationEndpoint ?? GOOGLE_AUTHORIZE_ENDPOINT
    );
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  async exchangeCode(input: OAuthExchangeInput): Promise<OAuthIdentity> {
    const fetcher = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetcher(this.options.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: input.code,
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          redirect_uri: input.redirectUri,
          code_verifier: input.codeVerifier,
        }).toString(),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch {
      throw new AppError("UPSTREAM_ERROR", "Google token exchange failed");
    }
    if (!response.ok) {
      throw new AppError(
        "UPSTREAM_ERROR",
        `Google token exchange failed (${response.status})`
      );
    }
    const data = (await response.json().catch(() => null)) as
      | GoogleTokenResponse
      | null;
    if (!data || typeof data.id_token !== "string") {
      throw new AppError("UPSTREAM_ERROR", "Google did not return an ID token");
    }
    return this.identityFromIdToken(data.id_token, input.nonce);
  }

  private async identityFromIdToken(
    idToken: string,
    nonce: string
  ): Promise<OAuthIdentity> {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new AppError("UPSTREAM_ERROR", "Google returned a malformed ID token");
    }
    const [headerPart, payloadPart, signaturePart] = parts;
    let header: { alg?: string; kid?: string };
    let claims: GoogleClaims;
    try {
      header = JSON.parse(
        Buffer.from(headerPart, "base64url").toString("utf8")
      );
      claims = JSON.parse(
        Buffer.from(payloadPart, "base64url").toString("utf8")
      );
    } catch {
      throw new AppError("UPSTREAM_ERROR", "Google returned a malformed ID token");
    }
    if (header.alg !== "RS256" || !header.kid) {
      throw new AppError("UPSTREAM_ERROR", "Google returned an unsupported ID token");
    }
    const key = await this.signingKey(header.kid);
    const validSignature = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`, "utf8"),
      key,
      Buffer.from(signaturePart, "base64url")
    );
    if (!validSignature) {
      throw new AppError("UPSTREAM_ERROR", "Google ID token signature is invalid");
    }

    const issuer = claims.iss;
    if (
      issuer !== "https://accounts.google.com" &&
      issuer !== "accounts.google.com"
    ) {
      throw new AppError("UPSTREAM_ERROR", "Google ID token issuer is invalid");
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(this.options.clientId)) {
      throw new AppError("UPSTREAM_ERROR", "Google ID token audience is invalid");
    }
    if (
      typeof claims.exp !== "number" ||
      claims.exp * 1000 + EXPIRY_SKEW_SECONDS * 1000 < Date.now()
    ) {
      throw new AppError("UPSTREAM_ERROR", "Google ID token has expired");
    }
    if (typeof claims.iat === "number" && claims.iat * 1000 > Date.now() + 5 * 60 * 1000) {
      throw new AppError("UPSTREAM_ERROR", "Google ID token is not valid yet");
    }
    if (claims.nonce !== nonce) {
      throw new AppError("UPSTREAM_ERROR", "Google ID token nonce is invalid");
    }
    if (claims.email_verified !== true) {
      throw new AppError("UPSTREAM_ERROR", "Google account email is not verified");
    }
    if (
      typeof claims.sub !== "string" ||
      claims.sub.length === 0 ||
      typeof claims.email !== "string" ||
      claims.email.length === 0
    ) {
      throw new AppError("UPSTREAM_ERROR", "Google ID token lacks identity claims");
    }
    return {
      provider: "google",
      subject: claims.sub,
      email: claims.email.trim().toLowerCase(),
      emailVerified: true,
      displayName:
        typeof claims.name === "string" && claims.name.trim().length > 0
          ? claims.name.trim().slice(0, 120)
          : null,
    };
  }

  private async signingKey(kid: string): Promise<ReturnType<typeof createPublicKey>> {
    if (
      !this.jwks ||
      this.jwks.expiresAt < Date.now() ||
      !this.jwks.keys.has(kid)
    ) {
      await this.refreshJwks();
    }
    const jwk = this.jwks?.keys.get(kid);
    if (!jwk) {
      throw new AppError("UPSTREAM_ERROR", "Google signing key is unknown");
    }
    try {
      return createPublicKey({ key: jwk as never, format: "jwk" });
    } catch {
      throw new AppError("UPSTREAM_ERROR", "Google signing key is invalid");
    }
  }

  private async refreshJwks(): Promise<void> {
    const fetcher = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetcher(this.options.jwksUri ?? GOOGLE_JWKS_URI, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch {
      throw new AppError("UPSTREAM_ERROR", "Google signing keys are unavailable");
    }
    if (!response.ok) {
      throw new AppError(
        "UPSTREAM_ERROR",
        `Google signing keys are unavailable (${response.status})`
      );
    }
    const data = (await response.json().catch(() => null)) as GoogleJwks | null;
    const keys = new Map<string, Record<string, unknown>>();
    for (const key of data?.keys ?? []) {
      if (typeof key.kid === "string") keys.set(key.kid, key);
    }
    if (keys.size === 0) {
      throw new AppError("UPSTREAM_ERROR", "Google returned no signing keys");
    }
    this.jwks = { keys, expiresAt: Date.now() + JWKS_TTL_MS };
  }
}

/** Honest placeholder: the routes report `configured: false` and refuse. */
export class DisabledOAuthProvider implements OAuthProvider {
  readonly configured = false;

  authorizationUrl(): string {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Google sign-in is not configured"
    );
  }

  async exchangeCode(): Promise<OAuthIdentity> {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Google sign-in is not configured"
    );
  }
}
