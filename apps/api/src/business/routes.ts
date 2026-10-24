import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Database } from "../db/database.js";
import type { AuthService } from "./auth.js";
import type { PaymentService } from "./payment.js";
import type { PrivateStorage } from "./storage.js";
import { generationPricing } from "./pricing.js";
import { enqueueJob, getJob } from "./jobs.js";
import { AppError } from "../errors/app-error.js";
import type { GenerationMode } from "./provider-mode.js";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  pkceChallenge,
  signOAuthState,
  verifyOAuthState,
  type OAuthProvider,
  type OAuthStatePayload,
} from "./oauth.js";
import { validateGenerateBody } from "../modules/generation/generation.validators.js";
import { validateVideoBody } from "../modules/generation/video.validators.js";
import {
  videoJobPricing,
  videoPricing,
  type VideoGenerationMode,
} from "./video-pricing.js";
import { validateImage } from "./storage.js";
import { isAssetAccessible, retentionState } from "./media-lifecycle.js";

import {
  authGuard,
  clearSessionCookie,
  readCookie,
  readSessionToken,
  sessionCookieValue,
  setSessionCookie,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

/**
 * Business HTTP surface (R03–R06): auth, wallet/credits, payments, orders,
 * async generation jobs and private creations. All state-changing browser
 * endpoints require the same JSON content type (enforced by the app parser)
 * and reject cross-site origins; the web client additionally tags its POSTs
 * with the X-WallHaze-Client header, which these routes require — a layered
 * CSRF defense under the cookie session.
 */

export interface BusinessRoutesOptions {
  db: Database;
  auth: AuthService;
  payments: PaymentService;
  storage: PrivateStorage;
  originAllowlist: ReadonlySet<string>;
  secureCookies: boolean;
  oauth: OAuthRoutesOptions;
  /** Persisted daily per-user AI cost budget in micro units; null = no limit. */
  userDailyCostLimitMicros: number | null;
  /** Platform-wide daily AI cost budget in micro units; null = no limit. */
  platformDailyCostMicrosLimit: number | null;
  /** Active generation mode (mock / live / disabled), for honest UI + filters. */
  generationMode: GenerationMode;
  /** Operator pause: async job creation and worker claims are refused. */
  generationPaused: boolean;
  /** Active payment provider ("mock" | "waffo"). */
  paymentProvider: string;
  /** True only when a real, redirectable checkout provider is configured. */
  checkoutAvailable: boolean;
  /** Development mock generation mode (placeholder output, no charge). */
  mockMode: boolean;
  /** True when a video adapter set is wired (pricing/jobs are enabled). */
  videoAvailable: boolean;
  /**
   * HMAC secret for short-lived image URLs. Needed because <img> requests
   * are cross-site subresources: SameSite cookies are NOT sent with them,
   * so private images must be authorized by a signed URL instead.
   */
  imageSigningSecret: string;
}

/** Lifetime of a signed private-image URL. */
const IMAGE_URL_TTL_SECONDS = 60 * 60;

function signImagePath(secret: string, jobId: string, expires: number): string {
  return createHmac("sha256", secret)
    .update(`${jobId}.${expires}`)
    .digest("base64url");
}

function verifyImageSignature(
  secret: string,
  jobId: string,
  expires: number,
  signature: string
): boolean {
  if (!Number.isInteger(expires) || expires * 1000 < Date.now()) return false;
  const expected = Buffer.from(signImagePath(secret, jobId, expires));
  const given = Buffer.from(signature ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type SignedMediaKind = "video" | "poster";
function signMediaPath(
  secret: string,
  kind: SignedMediaKind,
  jobId: string,
  expires: number
): string {
  return createHmac("sha256", secret)
    .update(`${kind}.${jobId}.${expires}`)
    .digest("base64url");
}
function verifyMediaSignature(
  secret: string,
  kind: SignedMediaKind,
  jobId: string,
  expires: number,
  signature: string
): boolean {
  if (!Number.isInteger(expires) || expires * 1000 < Date.now()) return false;
  const expected = Buffer.from(signMediaPath(secret, kind, jobId, expires));
  const given = Buffer.from(signature ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Parses one HTTP byte range. Multi-range requests are deliberately refused
 * (416) — a single MP4 reader needs one contiguous span, and multipart
 * responses add complexity without benefiting the player.
 */
export type ParsedByteRange =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "range"; start: number; end: number };
export function parseByteRange(
  header: string | undefined,
  size: number
): ParsedByteRange {
  if (!header) return { kind: "none" };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: "invalid" };
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return { kind: "invalid" };
  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return { kind: "invalid" };
    return {
      kind: "range",
      start: Math.max(0, size - suffix),
      end: size - 1,
    };
  }
  const start = Number(startRaw);
  if (!Number.isInteger(start) || start < 0 || start >= size) {
    return { kind: "invalid" };
  }
  const end = endRaw ? Number(endRaw) : size - 1;
  if (!Number.isInteger(end) || end < start) return { kind: "invalid" };
  return { kind: "range", start, end: Math.min(end, size - 1) };
}

/**
 * Browser-write CSRF layer: an Origin header, when present, must exactly
 * match the allowlist, and the JSON custom header must be set — the web
 * client sends it on every POST.
 */
function browserWriteGuard(originAllowlist: ReadonlySet<string>) {
  return async (request: FastifyRequest): Promise<void> => {
    const origin = request.headers.origin;
    if (typeof origin === "string" && origin.length > 0 && !originAllowlist.has(origin)) {
      throw new AppError("FORBIDDEN", "Request origin is not allowed");
    }
    if (request.headers["x-wallhaze-client"] !== "web") {
      throw new AppError("FORBIDDEN", "Missing client attestation header");
    }
  };
}

/** Cookie-authenticated route options with the browser-write guards. */
interface LedgerRow {
  [key: string]: unknown;
  id: string;
  created_at: Date | string;
  reason: string;
  balance_delta: number | string;
  reserved_delta: number | string;
  debt_delta: number | string;
}

interface PackageRow {
  [key: string]: unknown;
  id: string;
  credits: number | string;
  price_minor: number | string;
  currency: string;
  label: string;
}

interface OrderRow {
  [key: string]: unknown;
  id: string;
  status: string;
  package_id: string;
  amount_minor: number | string;
  currency: string;
  created_at: Date | string;
}

interface CreationRow {
  [key: string]: unknown;
  id: string;
  status: string;
  error_code: string | null;
  created_at: Date | string;
  request: unknown;
  storage_key: string | null;
  mime: string | null;
  media_type: string | null;
  duration_seconds: number | string | null;
  asset_width: number | string | null;
  asset_height: number | string | null;
  poster_storage_key: string | null;
  completed_at: Date | string | null;
  expires_at: Date | string | null;
  retention_policy: string | null;
  storage_status: string | null;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function publicUser(user: { id: string; email: string | null; displayName: string | null }) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: null,
  };
}

function creationView(
  row: CreationRow,
  signedImageUrl: (id: string) => string,
  signedVideoUrl: (id: string) => string,
  signedPosterUrl: (id: string) => string,
  nowMs = Date.now()
): {
  id: string;
  createdAt: string;
  prompt: string;
  motionPrompt: string | null;
  styleId: string | null;
  device: string;
  ratio: string | null;
  width: number | null;
  height: number | null;
  mediaType: "image" | "video";
  durationSeconds: number | null;
  imageUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  status: string;
  mock: boolean;
  completedAt: string | null;
  expiresAt: string | null;
  retentionStatus: ReturnType<typeof retentionState> | null;
  expired: boolean;
} {
  const request = (row.request ?? {}) as Record<string, unknown>;
  const mediaType = row.media_type === "video" ? "video" : "image";
  const imageSize = request.imageSize;
  const dims =
    imageSize && typeof imageSize === "object"
      ? (imageSize as { width?: unknown; height?: unknown })
      : null;
  const width =
    row.asset_width !== null && row.asset_width !== undefined
      ? Number(row.asset_width)
      : dims && Number.isInteger(dims.width)
        ? Number(dims.width)
        : null;
  const height =
    row.asset_height !== null && row.asset_height !== undefined
      ? Number(row.asset_height)
      : dims && Number.isInteger(dims.height)
        ? Number(dims.height)
        : null;
  const retention = {
    expiresAt: row.expires_at ? iso(row.expires_at) : null,
    retentionPolicy:
      row.retention_policy === "temporary_30d"
        ? ("temporary_30d" as const)
        : ("legacy" as const),
    storageStatus:
      row.storage_status === "deleting"
        ? ("deleting" as const)
        : row.storage_status === "deleted"
          ? ("deleted" as const)
          : row.storage_status === "delete_failed"
            ? ("delete_failed" as const)
            : ("active" as const),
  };
  const hasAsset = Boolean(row.storage_key);
  const accessible = hasAsset && isAssetAccessible(retention, nowMs);
  const state = hasAsset ? retentionState(retention, nowMs) : null;
  return {
    id: row.id,
    createdAt: iso(row.created_at),
    prompt: typeof request.prompt === "string" ? request.prompt : "",
    motionPrompt:
      typeof request.motionPrompt === "string" ? request.motionPrompt : null,
    styleId: typeof request.styleId === "string" ? request.styleId : null,
    device: typeof request.device === "string" ? request.device : "desktop",
    ratio:
      typeof request.aspectRatio === "string"
        ? request.aspectRatio
        : typeof request.ratio === "string"
          ? request.ratio
          : null,
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
    mediaType,
    durationSeconds:
      row.duration_seconds === null || row.duration_seconds === undefined
        ? null
        : Number(row.duration_seconds),
    imageUrl:
      mediaType === "image" && accessible ? signedImageUrl(row.id) : null,
    videoUrl:
      mediaType === "video" && accessible ? signedVideoUrl(row.id) : null,
    posterUrl:
      mediaType === "video" && accessible && row.poster_storage_key
        ? signedPosterUrl(row.id)
        : null,
    status: row.status,
    mock: Boolean((request as { _mock?: unknown })._mock),
    completedAt: row.completed_at ? iso(row.completed_at) : null,
    expiresAt: retention.expiresAt,
    retentionStatus: state,
    expired:
      state === "expired" ||
      state === "deleted" ||
      state === "deleting" ||
      state === "delete_failed",
  };
}

/** Google OAuth configuration for the browser redirect flow. */
export interface OAuthRoutesOptions {
  provider: OAuthProvider;
  /** Exact redirect URI registered in the Google Cloud console. */
  redirectUri: string;
  /** Web app origin (no trailing slash) — callback landing + open-redirect check. */
  webBaseUrl: string;
  /** HMAC secret for the short-lived state cookie. */
  stateSecret: string;
  secureCookies: boolean;
}

const OAUTH_COOKIE_PATH = "/v1/auth/oauth";

function oauthStateCookie(
  value: string,
  secure: boolean,
  maxAgeSeconds: number
): string {
  return [
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}`,
    `Path=${OAUTH_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Only relative web paths or absolute URLs on the configured web origin are
 * accepted. The value is stored in the SIGNED state cookie, so a tampered
 * query string cannot turn the callback into an open redirect.
 */
function safeReturnTo(
  raw: unknown,
  allowlist: ReadonlySet<string>,
  fallback: string
): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) {
    return fallback;
  }
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    if (allowlist.has(url.origin)) return url.toString();
  } catch {
    // fall through to the default
  }
  return fallback;
}

function safeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Keeps OAuth errors on the same locale as the requested return path. */
function loginPathFor(returnTo: string): string {
  const match = /^\/([a-z]{2})(?:\/|$)/.exec(returnTo);
  return match ? `/${match[1]}/login` : "/login";
}

export async function businessRoutes(
  app: FastifyInstance,
  options: BusinessRoutesOptions
): Promise<void> {
  const { db, auth, payments } = options;
  const writeGuard = browserWriteGuard(options.originAllowlist);
  // Signed URLs: <img>/download links work cross-site without relying on
  // SameSite cookies, and they expire.
  const signedImageUrl = (id: string): string => {
    const expires = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
    const sig = signImagePath(options.imageSigningSecret, id, expires);
    return `/v1/creations/${id}/image?exp=${expires}&sig=${sig}`;
  };
  const signedVideoUrl = (id: string): string => {
    const expires = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
    const sig = signMediaPath(options.imageSigningSecret, "video", id, expires);
    return `/v1/creations/${id}/video?exp=${expires}&sig=${sig}`;
  };
  const signedPosterUrl = (id: string): string => {
    const expires = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
    const sig = signMediaPath(options.imageSigningSecret, "poster", id, expires);
    return `/v1/creations/${id}/poster?exp=${expires}&sig=${sig}`;
  };

  const loadMediaCreation = async (
    request: FastifyRequest,
    id: string,
    kind: SignedMediaKind,
    expires: number,
    sig: string | undefined
  ) => {
    const signed =
      typeof sig === "string" &&
      sig.length > 0 &&
      verifyMediaSignature(options.imageSigningSecret, kind, id, expires, sig);
    let ownerId: string | null = null;
    if (!signed) {
      const token = readSessionToken(request);
      const session = token ? await auth.session(token) : null;
      ownerId = session?.user.id ?? null;
    }
    if (!signed && !ownerId) {
      throw new AppError("UNAUTHENTICATED", "Sign in to continue");
    }
    const owners = (
      await db.query<{ user_id: string }>(
        "SELECT user_id FROM generation_jobs WHERE id=$1 AND deleted_at IS NULL",
        [id]
      )
    ).rows;
    const owner = owners[0]?.user_id ?? null;
    if (!owner || (ownerId !== null && ownerId !== owner)) {
      throw new AppError("NOT_FOUND", "Creation not found");
    }
    const job = await getJob(db, owner, id);
    if (!job || !job.asset) {
      throw new AppError("NOT_FOUND", "Creation not found");
    }
    if (!isAssetAccessible(job.asset)) {
      throw new AppError("NOT_FOUND", "Creation not found");
    }
    return job;
  };
  const authOnly = { preHandler: authGuard(auth) };
  // Authenticated READS: cookie session only. Authenticated WRITES: the
  // browser-write CSRF layer additionally applies (Origin + attestation).
  const requireUser = authOnly;

  // ---------- Auth ----------
  app.post("/v1/auth/signup", { preHandler: writeGuard }, async (request, reply) => {
    const body = (request.body ?? {}) as { email?: unknown; password?: unknown };
    const result = await auth.signUp(
      String(body.email ?? ""),
      String(body.password ?? ""),
      request.ip
    );
    setSessionCookie(reply, result.token, { secure: options.secureCookies });
    return { user: publicUser(result.session.user), expiresAt: result.session.expiresAt };
  });

  app.post("/v1/auth/login", { preHandler: writeGuard }, async (request, reply) => {
    const body = (request.body ?? {}) as { email?: unknown; password?: unknown };
    const result = await auth.signIn(
      String(body.email ?? ""),
      String(body.password ?? ""),
      request.ip
    );
    setSessionCookie(reply, result.token, { secure: options.secureCookies });
    return { user: publicUser(result.session.user), expiresAt: result.session.expiresAt };
  });

  app.post("/v1/auth/logout", { preHandler: writeGuard }, async (request, reply) => {
    const token = readSessionToken(request);
    if (token) await auth.signOut(token);
    clearSessionCookie(reply, { secure: options.secureCookies });
    return { ok: true };
  });

  app.get("/v1/auth/session", async (request) => {
    const token = readSessionToken(request);
    const session = token ? await auth.session(token) : null;
    // The web adapter contract: null data means "no active session".
    if (!session) return null;
    return { user: publicUser(session.user), expiresAt: session.expiresAt };
  });

  // ---------- Google OAuth (Authorization Code + PKCE) ----------
  //
  // The browser follows a top-level redirect: start → Google → callback →
  // web app. The state cookie carries the PKCE verifier and the nonce; both
  // are signed, HttpOnly and short-lived. The callback sets the same opaque
  // session cookie as the password routes, then redirects with NO token in
  // the URL.
  const oauth = options.oauth;

  app.get("/v1/auth/oauth/google/status", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return { google: oauth.provider.configured };
  });

  app.get("/v1/auth/oauth/google/start", async (request, reply) => {
    if (!oauth.provider.configured) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "Google sign-in is not configured"
      );
    }
    const query = (request.query ?? {}) as {
      returnTo?: unknown;
      mode?: unknown;
    };
    const mode = query.mode === "link" ? "link" : "signin";
    let userId: string | undefined;
    if (mode === "link") {
      // Linking attaches an identity to the CURRENT session only.
      const token = readSessionToken(request);
      const session = token ? await auth.session(token) : null;
      if (!session) {
        throw new AppError("UNAUTHENTICATED", "Sign in before connecting Google");
      }
      userId = session.user.id;
    }

    const returnTo = safeReturnTo(
      query.returnTo,
      options.originAllowlist,
      "/account"
    );
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const nonce = randomBytes(16).toString("base64url");
    const payload: OAuthStatePayload = {
      state,
      verifier,
      nonce,
      returnTo,
      mode,
      ...(userId ? { userId } : {}),
      exp: Date.now() + OAUTH_STATE_TTL_MS,
    };
    reply.header("cache-control", "no-store");
    reply.header(
      "set-cookie",
      oauthStateCookie(
        signOAuthState(oauth.stateSecret, payload),
        oauth.secureCookies,
        Math.floor(OAUTH_STATE_TTL_MS / 1000)
      )
    );
    return reply.redirect(
      oauth.provider.authorizationUrl({
        state,
        nonce,
        codeChallenge: pkceChallenge(verifier),
        redirectUri: oauth.redirectUri,
      }),
      302
    );
  });

  app.get("/v1/auth/oauth/google/callback", async (request, reply) => {
    const query = (request.query ?? {}) as {
      code?: unknown;
      state?: unknown;
      error?: unknown;
    };
    const clearStateCookie = oauthStateCookie("", oauth.secureCookies, 0);
    const rawStateCookie = readCookie(request, OAUTH_STATE_COOKIE);
    const parsed = rawStateCookie
      ? verifyOAuthState(oauth.stateSecret, rawStateCookie)
      : null;
    const payload = parsed && parsed.exp > Date.now() ? parsed : null;

    const fail = (code: string) => {
      const path = payload ? loginPathFor(payload.returnTo) : "/login";
      const url = new URL(path, oauth.webBaseUrl);
      url.searchParams.set("oauthError", code);
      reply.header("set-cookie", [clearStateCookie]);
      return reply.redirect(url.toString(), 302);
    };

    if (!oauth.provider.configured) return fail("unavailable");
    if (typeof query.error === "string" && query.error.length > 0) {
      return fail(query.error === "access_denied" ? "denied" : "failed");
    }
    if (
      !payload ||
      typeof query.state !== "string" ||
      typeof query.code !== "string" ||
      !safeEqualText(query.state, payload.state)
    ) {
      return fail("state");
    }

    try {
      const identity = await oauth.provider.exchangeCode({
        code: query.code,
        codeVerifier: payload.verifier,
        redirectUri: oauth.redirectUri,
        nonce: payload.nonce,
      });

      if (payload.mode === "link") {
        const token = readSessionToken(request);
        const session = token ? await auth.session(token) : null;
        if (!session || session.user.id !== payload.userId) {
          return fail("session");
        }
        await auth.linkOAuthIdentity(session.user.id, identity);
        const url = new URL(payload.returnTo, oauth.webBaseUrl);
        url.searchParams.set("oauth", "linked");
        reply.header("set-cookie", [clearStateCookie]);
        return reply.redirect(url.toString(), 302);
      }

      const result = await auth.signInWithOAuth(identity);
      reply.header("set-cookie", [
        sessionCookieValue(result.token, { secure: oauth.secureCookies }),
        clearStateCookie,
      ]);
      return reply.redirect(
        new URL(payload.returnTo, oauth.webBaseUrl).toString(),
        302
      );
    } catch (error) {
      if (error instanceof AppError) {
        const details = error.details as { reason?: string } | undefined;
        if (details?.reason === "email_exists") return fail("email_exists");
        if (details?.reason === "google_already_linked") {
          return fail("google_already_linked");
        }
        if (details?.reason === "google_identity_taken") {
          return fail("google_identity_taken");
        }
        if (details?.reason === "suspended") return fail("suspended");
      }
      request.log.warn({ err: error }, "google oauth callback failed");
      return fail("failed");
    }
  });

  app.get(
    "/v1/auth/oauth/links",
    { preHandler: authGuard(auth) },
    async (request) => {
      const providers = await auth.oauthProviders(
        (request as AuthenticatedRequest).user.id
      );
      return { google: providers.includes("google") };
    }
  );

  // ---------- Credits / wallet ----------
  app.get("/v1/credits/wallet", requireUser, async (request) => {
    const row = (
      await db.query<{
        balance: number | string;
        reserved: number | string;
        updated_at: Date | string;
      }>(
        "SELECT balance,reserved,updated_at FROM credit_wallets WHERE user_id=$1",
        [(request as AuthenticatedRequest).user.id]
      )
    ).rows[0];
    return {
      credits: row ? Number(row.balance) : 0,
      reserved: row ? Number(row.reserved) : 0,
      updatedAt: row ? iso(row.updated_at) : null,
    };
  });

  app.get("/v1/credits/packages", async () => {
    const rows = (
      await db.query<PackageRow>(
        "SELECT id,credits,price_minor,currency,label FROM credit_packages WHERE active ORDER BY credits"
      )
    ).rows;
    // Array payload — the web adapter contract (CreditPackage[]).
    return rows.map((row) => ({
      id: row.id,
      credits: Number(row.credits),
      priceMinorUnits: Number(row.price_minor),
      currency: row.currency,
      label: row.label,
    }));
  });

  app.get("/v1/credits/pricing", async () => ({
    ...generationPricing(),
    paymentProvider: options.paymentProvider,
    checkoutAvailable: options.checkoutAvailable,
    generationMode: options.generationMode,
    paused: options.generationPaused,
    video: videoPricing(
      options.videoAvailable ? options.generationMode : "disabled"
    ),
  }));

  app.get("/v1/credits/transactions", requireUser, async (request) => {
    const rows = (
      await db.query<LedgerRow>(
        "SELECT id,created_at,reason,balance_delta,reserved_delta,debt_delta FROM credit_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [(request as AuthenticatedRequest).user.id]
      )
    ).rows;
    // Array payload — the web adapter contract (CreditTransaction[]).
    return rows.map((row) => ({
      id: row.id,
      createdAt: iso(row.created_at),
      // Net worth effect: balance change minus debt change (debt is owed).
      delta: Number(row.balance_delta) - Number(row.debt_delta),
      // Reservation-only events move this instead of the balance; exposed so
      // the UI can group them as internal (never as a 0-Credit charge).
      reservedDelta: Number(row.reserved_delta),
      reason: row.reason,
    }));
  });

  // ---------- Payments / orders ----------
  app.post("/v1/payments/checkout", requireUser, async (request) => {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key header is required");
    }
    return payments.checkout(
      (request as AuthenticatedRequest).user.id,
      (request.body ?? {}) as { packageId: string; successUrl: string; cancelUrl: string },
      key
    );
  });

  // Pull-based verification after returning from the cashier. Owner-scoped
  // and idempotent; the browser cannot receive webhooks on its own.
  app.post(
    "/v1/payments/orders/:id/sync",
    { preHandler: [writeGuard, authGuard(auth)] },
    async (request) => {
      const { id } = request.params as { id: string };
      return payments.syncOrder((request as AuthenticatedRequest).user.id, id);
    }
  );

  app.get("/v1/orders", requireUser, async (request) => {
    const orders = await payments.listOrders((request as AuthenticatedRequest).user.id);
    return {
      items: orders.map((order) => ({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        packageId: order.packageId,
        amountMinorUnits: order.amountMinor,
        currency: order.currency,
      })),
    };
  });

  app.get("/v1/orders/:id", requireUser, async (request) => {
    const { id } = request.params as { id: string };
    const order = await payments.getOrder((request as AuthenticatedRequest).user.id, id);
    return {
      id: order.id,
      createdAt: order.createdAt,
      status: order.status,
      packageId: order.packageId,
      amountMinorUnits: order.amountMinor,
      currency: order.currency,
    };
  });

  // Provider webhook — signature verification uses the RAW request bytes
  // captured by the app-level parser (request.rawBody), so it sees exactly
  // what the provider signed. The mock PSP signs compact JSON; a real
  // adapter owns its own scheme over the same bytes.
  app.post("/v1/payments/webhook", async (request) => {
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    const raw = rawBody
      ? rawBody.toString("utf8")
      : JSON.stringify(request.body ?? {});
    const signature =
      (request.headers["x-waffo-signature"] as string | undefined) ??
      (request.headers["x-signature"] as string | undefined) ??
      (request.headers["x-mock-signature"] as string | undefined) ??
      "";
    const result = await payments.receive(raw, signature);
    return { received: true, applied: result.applied };
  });

  // ---------- Async generation jobs ----------
  app.post(
    "/v1/generations/jobs",
    {
      // Same 10 MiB budget as the synchronous route: reference images are
      // capped at 5 MiB decoded, so the default 1 MiB body limit would reject
      // legitimate requests.
      bodyLimit: 10 * 1024 * 1024,
      preHandler: [writeGuard, authGuard(auth)],
    },
    async (request, reply) => {
      if (options.generationPaused) {
        throw new AppError(
          "SERVICE_UNAVAILABLE",
          "Image generation is paused by the server. Please try again later."
        );
      }
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || key.length === 0) {
        throw new AppError("VALIDATION_ERROR", "Idempotency-Key header is required");
      }
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (
        body.mediaType !== undefined &&
        body.mediaType !== "image" &&
        body.mediaType !== "video"
      ) {
        throw new AppError("VALIDATION_ERROR", "Invalid mediaType");
      }
      const isVideo = body.mediaType === "video";
      const inputHash = createHash("sha256")
        .update(JSON.stringify(body))
        .digest("hex");

      let storedRequest: Record<string, unknown>;
      let price: number;
      let costMicros: number;
      let mediaType: "image" | "video" = "image";
      let generationMode:
        | "text_to_image"
        | "image_edit"
        | "text_to_video"
        | "image_to_video" = "text_to_image";
      let durationSeconds: number | null = null;
      let sourceCreationId: string | null = null;

      if (isVideo) {
        if (!options.videoAvailable) {
          throw new AppError(
            "SERVICE_UNAVAILABLE",
            "Live wallpaper generation is not configured yet."
          );
        }
        const validation = validateVideoBody(body, options.generationMode);
        if (!validation.ok) {
          throw new AppError(
            validation.status === 413 ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR",
            validation.message
          );
        }
        const validated = validation.value;
        sourceCreationId = validated.sourceCreationId;
        let sourceImageDataUri = validated.sourceImageDataUri;

        if (sourceCreationId) {
          const source = (
            await db.query<{
              id: string;
              storage_key: string;
              mime: string;
              media_type: string | null;
              size_bytes: number | string;
              request: unknown;
            }>(
              `SELECT j.id,a.storage_key,a.mime,a.media_type,a.size_bytes,j.request
               FROM generation_jobs j JOIN image_assets a ON a.job_id=j.id
               WHERE j.id=$1 AND j.user_id=$2 AND j.status='succeeded' AND j.deleted_at IS NULL`,
              [sourceCreationId, (request as AuthenticatedRequest).user.id]
            )
          ).rows[0];
          if (
            !source ||
            (source.media_type !== null && source.media_type !== "image") ||
            !source.mime.startsWith("image/")
          ) {
            throw new AppError(
              "VALIDATION_ERROR",
              "That creation is not available for animation."
            );
          }
          if (
            !options.mockMode &&
            Boolean((source.request as { _mock?: unknown } | null)?._mock)
          ) {
            throw new AppError(
              "VALIDATION_ERROR",
              "A mock image cannot be animated in live mode."
            );
          }
          if (Number(source.size_bytes) > 5 * 1024 * 1024) {
            throw new AppError(
              "PAYLOAD_TOO_LARGE",
              "Source image is too large — please use an image under 5 MB."
            );
          }
          const stored = await options.storage.get(source.storage_key);
          validateImage(stored.bytes, stored.mime, 5 * 1024 * 1024);
          sourceImageDataUri = `data:${stored.mime};base64,${stored.bytes.toString("base64")}`;
        }

        const jobPricing = videoJobPricing(
          options.generationMode,
          validated.generationMode as VideoGenerationMode,
          validated.durationSeconds
        );
        if (!jobPricing) {
          throw new AppError(
            "VALIDATION_ERROR",
            "That video duration is not supported by the active provider."
          );
        }
        price = jobPricing.creditsPerGeneration;
        costMicros = jobPricing.costBoundMicros;
        mediaType = "video";
        generationMode = validated.generationMode;
        durationSeconds = validated.durationSeconds;
        storedRequest = {
          ...body,
          ...(sourceImageDataUri && !body.refImage
            ? { _sourceImageDataUri: sourceImageDataUri }
            : {}),
          _composed: {
            prompt: validated.finalPrompt,
            motionPrompt: validated.motionPrompt,
            negativePrompt: validated.negativePrompt,
            styleVersion: validated.promptVersion,
            builderVersion: validated.builderVersion,
            generationMode: validated.generationMode,
            durationSeconds: validated.durationSeconds,
          },
          _mock: options.mockMode,
        };
      } else {
        const validation = validateGenerateBody(body);
        if (!validation.ok) {
          throw new AppError(
            validation.status === 413 ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR",
            validation.message
          );
        }
        const staticPricing = generationPricing();
        price = staticPricing.creditsPerGeneration;
        costMicros = staticPricing.costBoundMicros;
        generationMode = body.refImage ? "image_edit" : "text_to_image";
        // Persist the composed prompt with the job: a later template edit must
        // not change a generation that was already accepted and priced.
        storedRequest = {
          ...body,
          _composed: {
            prompt: validation.value.finalPrompt,
            negativePrompt: validation.value.negativePrompt,
            styleVersion: validation.value.promptVersion,
            builderVersion: validation.value.builderVersion,
          },
          _mock: options.mockMode,
        };
      }

      const { job, deduped } = await enqueueJob(db, {
        userId: (request as AuthenticatedRequest).user.id,
        idempotencyKey: key,
        request: storedRequest,
        inputHash,
        price,
        costMicros,
        mediaType,
        generationMode,
        durationSeconds,
        sourceCreationId,
        userDailyCostMicrosLimit: options.userDailyCostLimitMicros ?? undefined,
        platformDailyCostMicrosLimit:
          options.platformDailyCostMicrosLimit ?? undefined,
      });
      void deduped;
      // Job-level diagnostics: request id is already on the Fastify log line;
      // no prompt, reference image or key is included.
      request.log.info({
        event: "generation.job.created",
        jobId: job.id,
        credits: job.credits,
        mediaType,
        generationMode,
        mock: options.mockMode,
      });
      reply.code(202);
      return {
        jobId: job.id,
        status: job.status,
        priceCredits: job.credits,
        mediaType,
        generationMode,
        durationSeconds,
      };
    }
  );

  // Job status polling for the Studio (owner-scoped). Failed jobs expose a
  // stable error code so the UI can release the user's hold state.
  app.get(
    "/v1/generations/jobs/:id",
    { preHandler: authGuard(auth) },
    async (request) => {
      const { id } = request.params as { id: string };
      const userId = (request as AuthenticatedRequest).user.id;
      const job = await getJob(db, userId, id);
      if (!job || job.deletedAt) {
        throw new AppError("NOT_FOUND", "Generation job not found");
      }
      const isVideo = job.mediaType === "video" || job.asset?.mediaType === "video";
      const accessible = Boolean(job.asset && isAssetAccessible(job.asset));
      const videoUrl = isVideo && job.asset && accessible ? signedVideoUrl(job.id) : null;
      const state = job.asset ? retentionState(job.asset) : null;
      return {
        jobId: job.id,
        status: job.status,
        errorCode: job.errorCode,
        priceCredits: job.credits,
        mediaType: isVideo ? "video" : "image",
        imageUrl:
          !isVideo && job.asset && accessible ? signedImageUrl(job.id) : null,
        videoUrl,
        videoDownloadUrl: videoUrl ? `${videoUrl}&download=1` : null,
        posterUrl:
          isVideo && job.asset?.posterStorageKey && accessible
            ? signedPosterUrl(job.id)
            : null,
        durationSeconds: isVideo
          ? job.asset?.durationSeconds ?? job.durationSeconds
          : null,
        width: isVideo ? job.asset?.width ?? job.width : null,
        height: isVideo ? job.asset?.height ?? job.height : null,
        mime: job.asset?.mime ?? null,
        mock:
          options.mockMode ||
          Boolean((job.request as { _mock?: unknown } | null)?._mock),
        createdAt: job.createdAt,
        completedAt: job.asset?.completedAt ?? null,
        expiresAt: job.asset?.expiresAt ?? null,
        retentionStatus: state,
        expired:
      state === "expired" ||
      state === "deleted" ||
      state === "deleting" ||
      state === "delete_failed",
      };
    }
  );

  // ---------- Private creations ----------
  app.get("/v1/creations", { preHandler: authGuard(auth) }, async (request) => {
    const cursorRaw = (request.query as { cursor?: string }).cursor;
    const mediaFilterRaw = (request.query as { mediaType?: string }).mediaType;
    if (
      mediaFilterRaw !== undefined &&
      mediaFilterRaw !== "image" &&
      mediaFilterRaw !== "video"
    ) {
      throw new AppError("VALIDATION_ERROR", "Invalid mediaType filter");
    }
    const cursorDate = cursorRaw ? new Date(cursorRaw) : null;
    if (cursorRaw && (Number.isNaN(cursorDate?.getTime()) || cursorDate === null)) {
      throw new AppError("VALIDATION_ERROR", "Invalid cursor");
    }
    const rows = (
      await db.query<CreationRow>(
        `SELECT j.id,j.status,j.error_code,j.created_at,j.request,
                a.storage_key,a.mime,a.media_type,a.duration_seconds,
                a.width AS asset_width,a.height AS asset_height,a.poster_storage_key,
                a.completed_at,a.expires_at,a.retention_policy,a.storage_status
         FROM generation_jobs j LEFT JOIN image_assets a ON a.job_id=j.id
         WHERE j.user_id=$1 AND j.deleted_at IS NULL AND j.status='succeeded'
           AND ($2::timestamptz IS NULL OR j.created_at < $2::timestamptz)
           AND ($3::text IS NULL OR j.media_type=$3)
           ${
             options.generationMode === "live"
               ? "AND COALESCE((j.request->>'_mock')::boolean,false)=false"
               : ""
           }
         ORDER BY j.created_at DESC
         LIMIT 21`,
        [
          (request as AuthenticatedRequest).user.id,
          cursorDate ? cursorDate.toISOString() : null,
          mediaFilterRaw ?? null,
        ]
      )
    ).rows;
    const page = rows.slice(0, 20);
    return {
      items: page.map((row) =>
        creationView(row, signedImageUrl, signedVideoUrl, signedPosterUrl)
      ),
      nextCursor:
        rows.length > 20 && page.length > 0
          ? iso(page[page.length - 1].created_at)
          : null,
    };
  });

  app.get("/v1/creations/:id", { preHandler: authGuard(auth) }, async (request) => {
    const { id } = request.params as { id: string };
    const job = await getJob(db, (request as AuthenticatedRequest).user.id, id);
    if (!job || job.deletedAt) {
      throw new AppError("NOT_FOUND", "Creation not found");
    }
    const accessible = Boolean(job.asset && isAssetAccessible(job.asset));
    const lifecycle = job.asset ? retentionState(job.asset) : null;
    const request_ = (job.request ?? {}) as Record<string, unknown>;
    const dims =
      request_.imageSize && typeof request_.imageSize === "object"
        ? (request_.imageSize as { width?: unknown; height?: unknown })
        : null;
    const isVideo = job.mediaType === "video" || job.asset?.mediaType === "video";
    const videoUrl = isVideo ? signedVideoUrl(job.id) : null;
    return {
      id: job.id,
      createdAt: job.createdAt,
      prompt: typeof request_.prompt === "string" ? request_.prompt : "",
      motionPrompt:
        typeof request_.motionPrompt === "string" ? request_.motionPrompt : null,
      styleId: typeof request_.styleId === "string" ? request_.styleId : null,
      device: typeof request_.device === "string" ? request_.device : "desktop",
      ratio:
        typeof request_.aspectRatio === "string"
          ? request_.aspectRatio
          : typeof request_.ratio === "string"
            ? request_.ratio
            : null,
      width: isVideo
        ? job.asset?.width ?? job.width
        : dims && Number.isInteger(dims.width)
          ? Number(dims.width)
          : null,
      height: isVideo
        ? job.asset?.height ?? job.height
        : dims && Number.isInteger(dims.height)
          ? Number(dims.height)
          : null,
      mediaType: isVideo ? "video" : "image",
      durationSeconds: isVideo
        ? job.asset?.durationSeconds ?? job.durationSeconds
        : null,
      imageUrl: isVideo || !accessible ? null : signedImageUrl(job.id),
      videoUrl: accessible ? videoUrl : null,
      videoDownloadUrl: accessible && videoUrl ? `${videoUrl}&download=1` : null,
      posterUrl:
        isVideo && accessible && job.asset?.posterStorageKey
          ? signedPosterUrl(job.id)
          : null,
      mime: job.asset?.mime ?? null,
      status: job.status,
      errorCode: job.errorCode,
      mock: Boolean((request_ as { _mock?: unknown })._mock),
      completedAt: job.asset?.completedAt ?? null,
      expiresAt: job.asset?.expiresAt ?? null,
      retentionStatus: lifecycle,
      expired:
        lifecycle === "expired" ||
        lifecycle === "deleted" ||
        lifecycle === "deleting" ||
        lifecycle === "delete_failed",
    };
  });

  app.post(
    "/v1/creations/:id/delete",
    { preHandler: [writeGuard, authGuard(auth)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const job = await getJob(db, (request as AuthenticatedRequest).user.id, id);
      if (!job || job.deletedAt) {
        throw new AppError("NOT_FOUND", "Creation not found");
      }
      const storageKey = job.asset?.storageKey ?? null;
      const posterKey = job.asset?.posterStorageKey ?? null;
      await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE generation_jobs SET deleted_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
          [id, (request as AuthenticatedRequest).user.id]
        );
        if (storageKey) {
          await tx.query("DELETE FROM image_assets WHERE job_id=$1", [id]);
        }
      });
      if (storageKey) {
        await options.storage.delete(storageKey).catch(() => undefined);
      }
      if (posterKey) {
        await options.storage.delete(posterKey).catch(() => undefined);
      }
      return { ok: true };
    }
  );

  // Short-lived, owner-scoped download URL (the adapter contract). The
  // signed URL itself authorizes the bytes — no cookie needed cross-site.
  app.get(
    "/v1/creations/:id/download",
    { preHandler: authGuard(auth) },
    async (request) => {
      const { id } = request.params as { id: string };
      const job = await getJob(db, (request as AuthenticatedRequest).user.id, id);
      if (
        !job ||
        job.deletedAt ||
        !job.asset ||
        !isAssetAccessible(job.asset)
      ) {
        throw new AppError("NOT_FOUND", "Creation not found");
      }
      const expires = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
      if (job.asset.mediaType === "video") {
        const sig = signMediaPath(
          options.imageSigningSecret,
          "video",
          id,
          expires
        );
        return {
          url: `/v1/creations/${id}/video?download=1&exp=${expires}&sig=${sig}`,
          mediaType: "video",
        };
      }
      const sig = signImagePath(options.imageSigningSecret, id, expires);
      return {
        url: `/v1/creations/${id}/image?download=1&exp=${expires}&sig=${sig}`,
        mediaType: "image",
      };
    }
  );

  // Private image bytes. Authorization is EITHER a signed URL (browser
  // <img>/download, expiry-bounded) OR the owner's session cookie.
  app.get("/v1/creations/:id/image", async (request, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as {
      download?: string;
      exp?: string;
      sig?: string;
    };
    const expires = Number(query.exp);
    const signed =
      typeof query.sig === "string" &&
      query.sig.length > 0 &&
      verifyImageSignature(options.imageSigningSecret, id, expires, query.sig);

    let ownerId: string | null = null;
    if (!signed) {
      const token = readSessionToken(request);
      const session = token ? await auth.session(token) : null;
      ownerId = session?.user.id ?? null;
    }
    if (!signed && !ownerId) {
      throw new AppError("UNAUTHENTICATED", "Sign in to continue");
    }
    // Signed URLs are built only for the caller's own creations, so the
    // owner is re-derived from the asset; a cookie viewer must match it.
    const rows = (
      await db.query<{ user_id: string }>(
        "SELECT user_id FROM generation_jobs WHERE id=$1 AND deleted_at IS NULL",
        [id]
      )
    ).rows;
    const assetOwner = rows[0]?.user_id ?? null;
    if (!assetOwner || (ownerId !== null && ownerId !== assetOwner)) {
      throw new AppError("NOT_FOUND", "Creation not found");
    }
    const job = await getJob(db, assetOwner, id);
    if (!job || !job.asset || !isAssetAccessible(job.asset)) {
      throw new AppError("NOT_FOUND", "Creation not found");
    }
    if (job.asset.mediaType === "video") {
      throw new AppError("NOT_FOUND", "Creation not found");
    }
    const stored = await options.storage.get(job.asset.storageKey);
    reply.header("content-type", stored.mime);
    reply.header("cache-control", "private, max-age=3600");
    if (query.download === "1") {
      reply.header(
        "content-disposition",
        `attachment; filename="wallhaze-${id}.png"`
      );
    }
    return reply.send(stored.bytes);
  });

  // Private video bytes. Supports single HTTP Range requests so the browser
  // player can seek without downloading the whole file; HEAD is handled by
  // Fastify's automatic HEAD route for GET.
  app.get("/v1/creations/:id/video", async (request, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as {
      download?: string;
      exp?: string;
      sig?: string;
    };
    const job = await loadMediaCreation(
      request,
      id,
      "video",
      Number(query.exp),
      query.sig
    );
    if (job.asset?.mediaType !== "video") {
      throw new AppError("NOT_FOUND", "Creation not found");
    }
    const stored = await options.storage.get(job.asset.storageKey);
    const total = stored.bytes.length;
    const range = parseByteRange(request.headers.range, total);
    reply.header("content-type", stored.mime);
    reply.header("accept-ranges", "bytes");
    reply.header("cache-control", "private, max-age=3600");
    reply.header("x-content-type-options", "nosniff");
    if (query.download === "1") {
      reply.header(
        "content-disposition",
        `attachment; filename="wallhaze-${id}.mp4"`
      );
    }
    if (range.kind === "invalid") {
      reply.header("content-range", `bytes */${total}`);
      return reply.code(416).send();
    }
    if (range.kind === "range") {
      const length = range.end - range.start + 1;
      reply.header("content-range", `bytes ${range.start}-${range.end}/${total}`);
      reply.header("content-length", String(length));
      if (request.method === "HEAD") return reply.code(206).send();
      return reply.code(206).send(stored.bytes.subarray(range.start, range.end + 1));
    }
    reply.header("content-length", String(total));
    if (request.method === "HEAD") return reply.send();
    return reply.send(stored.bytes);
  });

  // Poster is a normal private image, signed with its own URL kind so a video
  // signature cannot be replayed against it.
  app.get("/v1/creations/:id/poster", async (request, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { exp?: string; sig?: string };
    const job = await loadMediaCreation(
      request,
      id,
      "poster",
      Number(query.exp),
      query.sig
    );
    if (
      job.asset?.mediaType !== "video" ||
      !job.asset.posterStorageKey
    ) {
      throw new AppError("NOT_FOUND", "Creation not found");
    }
    const stored = await options.storage.get(job.asset.posterStorageKey);
    reply.header("content-type", stored.mime);
    reply.header("content-length", String(stored.bytes.length));
    reply.header("cache-control", "private, max-age=3600");
    reply.header("x-content-type-options", "nosniff");
    if (request.method === "HEAD") return reply.send();
    return reply.send(stored.bytes);
  });
}
