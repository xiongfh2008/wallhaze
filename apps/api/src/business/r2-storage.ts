import { validateMedia, type PrivateStorage, type StoredMedia } from "./storage.js";
import { signS3Request } from "./r2-sign.js";

/**
 * Cloudflare R2-backed PrivateStorage (S3-compatible API, SigV4).
 *
 * - Path-style addressing: <endpoint>/<bucket>/<key>.
 * - Same put/get/delete contract as MemoryStorage/LocalStorage, including
 *   MIME/magic-byte validation, so the media pipeline is storage-agnostic.
 * - Keys keep the storage.ts keyCheck contract ([a-zA-Z0-9_.-]{1,160}).
 * - Range reads are served by R2 natively; this adapter always fetches whole
 *   objects (media is capped by MAX_VIDEO_BYTES) — signed URL serving for
 *   browsers is a route-level concern, not storage.
 */

const REQUEST_TIMEOUT_MS = 30_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 120_000;

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
    return `${this.base}/${key}`;
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
    const response = await (this.options.fetcher ?? fetch)(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: init.body ?? undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
    return response;
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
      throw new Error(
        `R2 put failed: ${describeR2NetworkError(error)}`
      );
    }
    if (!response.ok) {
      throw new Error(`R2 put failed: HTTP ${response.status}`);
    }
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
      throw new Error(
        `R2 get failed after ${READ_ATTEMPTS} attempts: ${describeR2NetworkError(lastError)}`
      );
    }
    if (response.status === 404) throw new Error("ASSET_MISSING");
    if (!response.ok) throw new Error(`R2 get failed: HTTP ${response.status}`);
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
      throw new Error(
        `R2 delete failed: ${describeR2NetworkError(error)}`
      );
    }
    // 204 = deleted; 404 = already gone (idempotent, same as LocalStorage).
    if (response.status !== 204 && response.status !== 404) {
      throw new Error(`R2 delete failed: HTTP ${response.status}`);
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
