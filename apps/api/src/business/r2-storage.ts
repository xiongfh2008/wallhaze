import { validateMedia, type PrivateStorage, type StoredMedia } from "./storage.js";
import { signS3Request } from "./r2-sign.js";

/**
 * Cloudflare R2-backed PrivateStorage (S3-compatible API, SigV4).
 *
 * - Path-style addressing: <endpoint>/<bucket>/<key>.
 * - Same put/get/delete contract as MemoryStorage/LocalStorage, including
 *   MIME/magic-byte validation, so the media pipeline is storage-agnostic.
 * - Object keys are validated at THIS request boundary with the same rule
 *   storage.ts enforces ([a-zA-Z0-9_.-]{1,160}) plus explicit rejection of
 *   "." and ".." (which the character class alone would allow and which
 *   would resolve outside the bucket in path-style URLs). See validateR2Key.
 * - Range reads are served by R2 natively; this adapter always fetches whole
 *   objects (media is capped by MAX_VIDEO_BYTES) — signed URL serving for
 *   browsers is a route-level concern, not storage.
 */

const REQUEST_TIMEOUT_MS = 30_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 120_000;

/**
 * Safe error taxonomy for scheduled-cleanup bookkeeping. Values stored in
 * `image_assets.last_cleanup_error` / `media_cleanup_runs.details` and
 * printed by the media-retention entry are limited to these codes (plus the
 * offending HTTP status when present) — never raw exception text, which can
 * carry endpoints, signatures or credential fragments.
 */
export type StorageErrorCode =
  | "NETWORK_TIMEOUT"
  | "R2_HTTP_4XX"
  | "R2_HTTP_5XX"
  | "R2_ACCESS_DENIED"
  | "INVALID_STORAGE_KEY"
  | "UNKNOWN";

export class R2RequestError extends Error {
  readonly code: StorageErrorCode;
  readonly status: number | null;
  constructor(code: StorageErrorCode, status: number | null = null) {
    super(
      status !== null
        ? `${code} (HTTP ${status})`
        : code
    );
    this.name = "R2RequestError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Key validation at the R2 request boundary. Reuses the exact rule
 * storage.ts applies (one source of truth for historical compatibility) and
 * adds the two path-traversal shapes the character class alone would miss:
 * the exact strings "." and "..".
 * Returns a safe code instead of raw details; the offending key is NOT
 * echoed back (it is caller-supplied input).
 */
export function validateR2Key(key: unknown): string {
  if (typeof key !== "string" || key.length === 0 || key.length > 160) {
    throw new R2RequestError("INVALID_STORAGE_KEY");
  }
  if (!/^[a-zA-Z0-9_.-]{1,160}$/.test(key)) {
    throw new R2RequestError("INVALID_STORAGE_KEY");
  }
  if (key === "." || key === "..") {
    throw new R2RequestError("INVALID_STORAGE_KEY");
  }
  return key;
}

// Reads (GET) are idempotent, so a transient network failure (undici
// "fetch failed": ECONNRESET / socket reuse races) or an R2 5xx is retried a
// bounded number of times. PUT/DELETE stay single-shot: a timed-out write
// has an UNCERTAIN outcome and must not be blindly repeated.
const READ_ATTEMPTS = 3;
const READ_BACKOFF_MS = [300, 600];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Classifies the undici cause chain into a redacted, loggable code. */
export function describeR2NetworkError(error: unknown): string {
  let cause: unknown = error;
  for (let depth = 0; depth < 4 && cause; depth += 1) {
    const c = cause as { name?: string; code?: string; message?: string; cause?: unknown };
    const name = c.name ?? "";
    const code = c.code ?? "";
    if (name === "TimeoutError" || name === "AbortError" || code === "ETIMEDOUT") {
      return `TIMEOUT(${code || name})`;
    }
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `DNS(${code})`;
    if (/TLS|CERT|SSL/i.test(code) || /TLS|certificate/i.test(name)) return `TLS(${code || name})`;
    if (code === "ECONNRESET" || code === "EPIPE" || /socket hang up/i.test(c.message ?? "")) {
      return `CONN_RESET(${code || "socket hang up"})`;
    }
    if (code) return `NETWORK(${code})`;
    cause = c.cause;
  }
  return "NETWORK(unknown)";
}

export interface R2StorageOptions {
  /** Account-level S3 endpoint, e.g. https://<account>.r2.cloudflarestorage.com (no bucket path). */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetcher?: typeof fetch;
}

export class R2Storage implements PrivateStorage {
  private readonly base: string;

  constructor(private readonly options: R2StorageOptions) {
    const trimmed = options.endpoint.replace(/\/+$/, "");
    if (!/^https:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/i.test(trimmed)) {
      throw new Error(
        "R2_ENDPOINT must be the account-level S3 endpoint (https://<account>.r2.cloudflarestorage.com)"
      );
    }
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i.test(options.bucket)) {
      throw new Error("R2 bucket name is invalid");
    }
    this.base = `${trimmed}/${options.bucket}`;
  }

  private keyUrl(key: string): string {
    // Boundary validation runs on EVERY request (put/get/delete) — the key
    // comes from DB rows / callers and must never escape the bucket path.
    return `${this.base}/${validateR2Key(key)}`;
  }

  private async request(
    method: "GET" | "HEAD" | "PUT" | "DELETE",
    key: string,
    init: { body?: Buffer; contentType?: string; timeoutMs?: number } = {}
  ): Promise<Response> {
    const signed = signS3Request({
      method,
      url: this.keyUrl(key),
      body: init.body,
      contentType: init.contentType,
      accessKeyId: this.options.accessKeyId,
      secretAccessKey: this.options.secretAccessKey,
    });
    let response: Response;
    try {
      response = await (this.options.fetcher ?? fetch)(signed.url, {
        method: signed.method,
        headers: signed.headers,
        body: init.body ?? undefined,
        signal: AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Network layer only — undici cause chain, redacted to a safe code.
      const description = describeR2NetworkError(error);
      throw new R2RequestError(
        description.startsWith("TIMEOUT") ? "NETWORK_TIMEOUT" : "UNKNOWN"
      );
    }
    return response;
  }

  /** Maps a non-ok R2 response to its safe error code. */
  private static errorForStatus(status: number): R2RequestError {
    if (status === 401 || status === 403) {
      return new R2RequestError("R2_ACCESS_DENIED", status);
    }
    if (status >= 400 && status <= 499) {
      return new R2RequestError("R2_HTTP_4XX", status);
    }
    if (status >= 500 && status <= 599) {
      return new R2RequestError("R2_HTTP_5XX", status);
    }
    return new R2RequestError("UNKNOWN", status);
  }

  async put(key: string, bytes: Buffer, mime: string): Promise<void> {
    validateMedia(bytes, mime);
    // Single-shot by design: a timed-out PUT has an uncertain outcome and
    // must surface to the caller (the job layer already owns retries).
    let response: Response;
    try {
      response = await this.request("PUT", key, {
        body: bytes,
        contentType: mime,
        timeoutMs: VIDEO_DOWNLOAD_TIMEOUT_MS,
      });
    } catch (error) {
      throw error instanceof R2RequestError
        ? error
        : new R2RequestError("UNKNOWN");
    }
    if (!response.ok) throw R2Storage.errorForStatus(response.status);
    // Drain the (empty) body so the socket is reusable.
    await response.arrayBuffer().catch(() => undefined);
  }

  async get(key: string): Promise<StoredMedia> {
    let response: Response | null = null;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt += 1) {
      try {
        const candidate = await this.request("GET", key, {
          timeoutMs: VIDEO_DOWNLOAD_TIMEOUT_MS,
        });
        if (
          candidate.status >= 500 &&
          candidate.status <= 504 &&
          attempt < READ_ATTEMPTS
        ) {
          await candidate.arrayBuffer().catch(() => undefined);
          await sleep(READ_BACKOFF_MS[attempt - 1] ?? 600);
          continue;
        }
        response = candidate;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < READ_ATTEMPTS) {
          await sleep(READ_BACKOFF_MS[attempt - 1] ?? 600);
          continue;
        }
      }
    }
    if (response === null) {
      throw lastError instanceof R2RequestError
        ? lastError
        : new R2RequestError("UNKNOWN");
    }
    if (response.status === 404) throw new Error("ASSET_MISSING");
    if (!response.ok) throw R2Storage.errorForStatus(response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    validateMedia(bytes, mime);
    return { bytes, mime };
  }

  async delete(key: string): Promise<void> {
    let response: Response;
    try {
      response = await this.request("DELETE", key);
    } catch (error) {
      throw error instanceof R2RequestError
        ? error
        : new R2RequestError("UNKNOWN");
    }
    // 204 = deleted; 404 = already gone (idempotent, same as LocalStorage).
    if (response.status !== 204 && response.status !== 404) {
      throw R2Storage.errorForStatus(response.status);
    }
    await response.arrayBuffer().catch(() => undefined);
  }
}

export interface R2EnvLike {
  STORAGE_DRIVER?: string;
  R2_ENDPOINT?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  NODE_ENV?: string;
}

/**
 * Fail-closed factory used by server.ts / worker.ts:
 * STORAGE_DRIVER=r2 requires the full credential set — a half-configured
 * production boot is refused instead of silently falling back to local disk.
 */
export function resolveStorageFromEnv(
  env: R2EnvLike,
  fallback: () => PrivateStorage
): PrivateStorage {
  if (env.STORAGE_DRIVER !== "r2") return fallback();
  return resolveR2StorageStrict(env);
}

/**
 * Strict variant for scheduled cleanup entries: when STORAGE_DRIVER is not
 * "r2" there is NO fallback at all — the caller decides whether a local
 * driver is acceptable. Used by jobs/media-retention.ts so a scheduled
 * deletion run can never silently run against the wrong storage.
 */
export function resolveR2StorageStrict(env: R2EnvLike): PrivateStorage {
  if (env.STORAGE_DRIVER !== "r2") {
    throw new Error(
      "STORAGE_DRIVER=r2 is required for scheduled media cleanup — refusing to run against any other storage"
    );
  }
  return resolveR2StorageStrictInner(env);
}

function resolveR2StorageStrictInner(env: R2EnvLike): PrivateStorage {
  const missing = (["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const).filter(
    (name) => !env[name]
  );
  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=r2 requires ${missing.join(", ")} — refusing to boot with incomplete R2 configuration`
    );
  }
  return new R2Storage({
    endpoint: env.R2_ENDPOINT!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucket: env.R2_BUCKET!,
  });
}
