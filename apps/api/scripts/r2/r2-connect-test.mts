/**
 * WallHaze R2 staging connection acceptance test (operator-run).
 *
 * SAFETY CONTRACT:
 *  - Credentials ONLY from environment variables (or an optional local creds
 *    file via R2_TEST_CREDS_FILE, default .env.r2-test, git-ignored). The
 *    report masks the account id and never logs keys or raw error URLs.
 *  - Touches ONLY keys under `deployment-test/<date>-<rand>/`. No listing,
 *    no cleanup of anything outside that prefix. Created keys are tracked
 *    and best-effort deleted on exit — normal, exceptional (throw) and
 *    SIGINT paths all run the same cleanup.
 *  - Read-only requests (HEAD/GET) retry a bounded number of times on
 *    NETWORK errors or 5xx only. PUT/DELETE and the anonymous probe are
 *    single-shot (no auto-retry of non-idempotent / uncertain operations).
 *  - The anonymous check uploads a REAL object first, verifies the signed
 *    GET control, then probes with a strictly credential-free request and
 *    records the HTTP status + S3 XML error code. A blanket 400 is NOT
 *    accepted: 400 passes only for an auth-related XML code with zero file
 *    bytes in the response.
 *
 * Usage (from apps/api), PowerShell:
 *   $env:R2_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
 *   $env:R2_ACCESS_KEY_ID="..."; $env:R2_SECRET_ACCESS_KEY="..."
 *   npm run r2:test
 *
 * Optional env:
 *   R2_TEST_PUBLIC_BUCKET  (default wallhaze-staging-public)
 *   R2_TEST_PRIVATE_BUCKET (default wallhaze-staging-private)
 *   R2_TEST_CREDS_FILE     (default .env.r2-test; loaded ONLY for vars that
 *                           are unset — file stays untracked)
 *
 * Exit code: 0 = all PASS, 1 = any FAIL.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { encodeS3Path, signS3Request } from "../../src/business/r2-sign.js";
import { probeMp4Metadata } from "../../src/business/media-metadata.js";
import {
  classifyAnonymousRefusal,
  maskR2Detail,
  parseS3XmlError,
} from "../../src/business/r2-errors.js";

// --- Credential loading (never logged) ---------------------------------------

function loadCredsFile(file: string): void {
  let text: string;
  try {
    text = readFileSync(path.resolve(file), "utf8");
  } catch {
    return; // optional
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) {
      process.env[key] = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
    }
  }
}

loadCredsFile(process.env.R2_TEST_CREDS_FILE ?? ".env.r2-test");

const ENDPOINT = (process.env.R2_ENDPOINT ?? "").replace(/\/+$/, "");
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const SECRET = process.env.R2_SECRET_ACCESS_KEY ?? "";
const PUBLIC_BUCKET = process.env.R2_TEST_PUBLIC_BUCKET ?? "wallhaze-staging-public";
const PRIVATE_BUCKET =
  process.env.R2_TEST_PRIVATE_BUCKET ?? "wallhaze-staging-private";

// --- Reporting ----------------------------------------------------------------

interface Step {
  name: string;
  status: string;
  ms: number;
  pass: boolean;
  detail?: string;
}

const results: Step[] = [];

function record(
  name: string,
  ms: number,
  pass: boolean,
  status: string,
  detail?: string
): void {
  results.push({ name, status, ms, pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}  [${status}] ${ms}ms${detail ? ` — ${detail}` : ""}`
  );
}

function mask(text: string): string {
  // Shared redaction (also masks raw access-key shapes) — see r2-errors.ts.
  return maskR2Detail(text);
}

/** Classifies a network failure from its undici cause chain (codes only). */
function classifyNetworkError(error: unknown): string {
  let cause: unknown = error;
  for (let depth = 0; depth < 4 && cause; depth += 1) {
    const c = cause as {
      name?: string;
      code?: string;
      message?: string;
      cause?: unknown;
    };
    const name = c.name ?? "";
    const code = c.code ?? "";
    if (
      name === "TimeoutError" ||
      name === "AbortError" ||
      code === "ETIMEDOUT" ||
      code === "UND_ERR_ABORT_TIMEOUT"
    ) {
      return `TIMEOUT(${code || name})`;
    }
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `DNS(${code})`;
    if (/TLS|CERT|SSL/i.test(code) || /TLS|certificate/i.test(name)) {
      return `TLS(${code || name})`;
    }
    if (
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      /socket hang up/i.test(c.message ?? "")
    ) {
      return `CONN_RESET(${code || "socket hang up"})`;
    }
    if (code === "ECONNREFUSED") return `REFUSED(${code})`;
    if (code) return `NETWORK(${code})`;
    cause = c.cause;
  }
  return "NETWORK(unknown)";
}

// --- S3 client ----------------------------------------------------------------

const READ_ATTEMPTS = 3; // 1 try + 2 retries — read-only ops only
const READ_BACKOFF_MS = [400, 800];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface S3Init {
  body?: Buffer;
  contentType?: string;
  headers?: Record<string, string>;
  anonymous?: boolean;
  timeoutMs?: number;
}

async function s3(
  bucket: string,
  method: "GET" | "HEAD" | "PUT" | "DELETE",
  key: string,
  init: S3Init = {}
): Promise<Response> {
  const url = `${ENDPOINT}/${bucket}/${encodeS3Path(key)}`;
  const headers: Record<string, string> = {};
  if (!init.anonymous) {
    const signed = signS3Request({
      method,
      url,
      body: init.body,
      contentType: init.contentType,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET,
    });
    Object.assign(headers, signed.headers);
  }
  Object.assign(headers, init.headers ?? {});
  return fetch(url, {
    method,
    headers,
    body: init.body ?? undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
  });
}

/** Read-only fetch with bounded retry on network errors / 5xx. PUT/DELETE never retry. */
async function s3Read(
  bucket: string,
  method: "GET" | "HEAD",
  key: string,
  init: S3Init = {}
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt += 1) {
    try {
      const response = await s3(bucket, method, key, init);
      if (
        response.status >= 500 &&
        response.status <= 504 &&
        attempt < READ_ATTEMPTS
      ) {
        await response.arrayBuffer().catch(() => undefined);
        await sleep(READ_BACKOFF_MS[attempt - 1] ?? 800);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < READ_ATTEMPTS) {
        await sleep(READ_BACKOFF_MS[attempt - 1] ?? 800);
        continue;
      }
    }
  }
  throw Object.assign(new Error("read failed after retries"), {
    cause: lastError,
  });
}

// --- Cleanup tracking -----------------------------------------------------------

const createdKeys = new Map<string, string>(); // key -> bucket

async function cleanup(): Promise<void> {
  const started = Date.now();
  const tracked = createdKeys.size;
  let deleted = 0;
  for (const [key, bucket] of [...createdKeys.entries()]) {
    try {
      const del = await s3(bucket, "DELETE", key);
      await del.arrayBuffer().catch(() => undefined);
      if (del.status === 204 || del.status === 404) {
        createdKeys.delete(key);
        deleted += 1;
        console.log(`      deleted ${bucket}/${key}`);
      } else {
        console.log(`      WARN ${bucket}/${key}: DELETE -> HTTP ${del.status}`);
      }
    } catch (error) {
      console.log(
        `      WARN ${bucket}/${key}: ${classifyNetworkError(error)}`
      );
    }
  }
  const left = createdKeys.size;
  record(
    "cleanup: delete tracked objects (tracked/deleted/left)",
    Date.now() - started,
    left === 0,
    left === 0 ? `${tracked}/${deleted}/0` : `${tracked}/${deleted}/${left}`,
    left === 0
      ? undefined
      : "leftovers remain under deployment-test/ (safe prefix); delete manually if needed"
  );

  // Independent verification: a read-only LIST scoped to THIS RUN's prefix
  // only. Zero keys remaining proves the cleanup, rather than assuming it
  // from the delete loop above. (Never lists outside deployment-test/<RUN>/.)
  const listStarted = Date.now();
  for (const bucket of [PRIVATE_BUCKET, PUBLIC_BUCKET]) {
    try {
      const listUrl = new URL(`${ENDPOINT}/${bucket}`);
      listUrl.searchParams.set("list-type", "2");
      listUrl.searchParams.set("max-keys", "1000");
      listUrl.searchParams.set("prefix", `${RUN}/`);
      const signed = signS3Request({
        method: "GET",
        url: listUrl.toString(),
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET,
      });
      const list = await fetch(listUrl.toString(), {
        method: "GET",
        headers: signed.headers,
        signal: AbortSignal.timeout(30_000),
      });
      const body = await list.text();
      const keys = [...body.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
      const label = bucket === PRIVATE_BUCKET ? "private" : "public";
      record(
        `cleanup verify: LIST ${label} bucket ${RUN}/ empty`,
        Date.now() - listStarted,
        list.ok && keys.length === 0,
        String(list.status),
        keys.length === 0 ? undefined : `remaining: ${keys.join(", ")}`
      );
    } catch (error) {
      record(
        "cleanup verify: LIST bucket prefix empty",
        Date.now() - listStarted,
        false,
        "ERR",
        classifyNetworkError(error)
      );
    }
  }
}

process.on("SIGINT", () => {
  void cleanup().finally(() => process.exit(130));
});

// --- Test body --------------------------------------------------------------------

const RUN = `deployment-test/${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
const TEXT = Buffer.from(
  `wallhaze r2 acceptance ${new Date().toISOString()}\n`,
  "utf8"
);
const MP4_PATH = path.resolve("assets", "live-mock", "9x16-3s.mp4");
const ANON_KEY = `${RUN}/anon-check.txt`;
const MP4_KEY = `${RUN}/range-test.mp4`;
/** Unique marker proving byte leakage (or its absence) in the anonymous body. */
const ANON_MARKER = `ANON-LEAK-PROBE-${randomUUID()}`;

function maskEndpoint(): string {
  return ENDPOINT.replace(
    /^https:\/\/([a-z0-9-]+)\./i,
    "https://<account>."
  );
}

async function bucketCycle(bucket: string, label: string): Promise<void> {
  const key = `${RUN}/${label}.txt`;

  let t = Date.now();
  try {
    const put = await s3(bucket, "PUT", key, {
      body: TEXT,
      contentType: "text/plain",
    });
    await put.arrayBuffer().catch(() => undefined);
    const ok = put.status === 200 || put.status === 201;
    record(`${label}: upload (PUT)`, Date.now() - t, ok, String(put.status));
    if (!ok) return;
    createdKeys.set(key, bucket);
  } catch (error) {
    record(
      `${label}: upload (PUT)`,
      Date.now() - t,
      false,
      "ERR",
      mask(String(error instanceof Error ? error.message : error))
    );
    return;
  }

  t = Date.now();
  try {
    const head = await s3Read(bucket, "HEAD", key);
    const len = head.headers.get("content-length");
    record(
      `${label}: HEAD metadata (network errors retried)`,
      Date.now() - t,
      head.ok && len === String(TEXT.length),
      String(head.status),
      `content-length=${len ?? "?"}`
    );
  } catch (error) {
    record(
      `${label}: HEAD metadata (network errors retried)`,
      Date.now() - t,
      false,
      "ERR",
      classifyNetworkError((error as { cause?: unknown }).cause ?? error)
    );
  }

  t = Date.now();
  try {
    const get = await s3Read(bucket, "GET", key);
    const body = Buffer.from(await get.arrayBuffer());
    record(
      `${label}: read (GET body matches)`,
      Date.now() - t,
      get.ok && body.equals(TEXT),
      String(get.status),
      `${body.length}B`
    );
  } catch (error) {
    record(
      `${label}: read (GET body matches)`,
      Date.now() - t,
      false,
      "ERR",
      classifyNetworkError((error as { cause?: unknown }).cause ?? error)
    );
  }

  t = Date.now();
  try {
    const del = await s3(bucket, "DELETE", key); // single-shot, no auto-retry
    await del.arrayBuffer().catch(() => undefined);
    record(
      `${label}: delete (DELETE)`,
      Date.now() - t,
      del.status === 204,
      String(del.status)
    );
  } catch (error) {
    record(
      `${label}: delete (DELETE)`,
      Date.now() - t,
      false,
      "ERR",
      mask(String(error instanceof Error ? error.message : error))
    );
    return;
  }

  t = Date.now();
  try {
    const gone = await s3Read(bucket, "GET", key);
    await gone.arrayBuffer().catch(() => undefined);
    record(
      `${label}: 404 after delete`,
      Date.now() - t,
      gone.status === 404,
      String(gone.status)
    );
  } catch (error) {
    record(
      `${label}: 404 after delete`,
      Date.now() - t,
      false,
      "ERR",
      classifyNetworkError((error as { cause?: unknown }).cause ?? error)
    );
  } finally {
    // The cycle steps above already reported on this key's deletion; stop
    // tracking it so cleanup does not re-delete what was just verified.
    createdKeys.delete(key);
  }
}

async function anonymousCheck(bucket: string, label: string): Promise<void> {
  const key = `${RUN}/anon-check-${label}.txt`;
  const marker = `ANON-LEAK-PROBE-${randomUUID()}`;
  const payload = Buffer.concat([
    TEXT,
    Buffer.from(marker, "utf8"),
  ]);

  // 1) Upload a REAL object for this probe. (Root cause of the first-run
  //    confusion: the old script probed a key that was never uploaded.)
  let t = Date.now();
  try {
    const put = await s3(bucket, "PUT", key, {
      body: payload,
      contentType: "text/plain",
    });
    await put.arrayBuffer().catch(() => undefined);
    const ok = put.status === 200 || put.status === 201;
    record(
      `${label} anon: upload real object (signed PUT)`,
      Date.now() - t,
      ok,
      String(put.status)
    );
    if (!ok) return;
    createdKeys.set(key, bucket);
  } catch (error) {
    record(
      `${label} anon: upload real object (signed PUT)`,
      Date.now() - t,
      false,
      "ERR",
      mask(String(error instanceof Error ? error.message : error))
    );
    return;
  }

  // 2) Signed control on the SAME URL: proves URL/bucket/key/Host encoding
  //    are all correct, so any later refusal is about AUTH, not construction.
  t = Date.now();
  try {
    const control = await s3Read(bucket, "GET", key);
    const body = Buffer.from(await control.arrayBuffer());
    record(
      `${label} anon: signed GET control (construction proven)`,
      Date.now() - t,
      control.ok && body.includes(Buffer.from(marker, "utf8")),
      String(control.status),
      `${body.length}B`
    );
  } catch (error) {
    record(
      `${label} anon: signed GET control (construction proven)`,
      Date.now() - t,
      false,
      "ERR",
      classifyNetworkError((error as { cause?: unknown }).cause ?? error)
    );
    return;
  }

  // 3) Anonymous GET: identical URL, explicit EMPTY header map — no
  //    Authorization, no Cookie, nothing inherited. The S3 API host
  //    (*.r2.cloudflarestorage.com) is asserted at startup; r2.dev and
  //    custom public domains are never constructed by this script.
  t = Date.now();
  try {
    const anon = await fetch(`${ENDPOINT}/${bucket}/${encodeS3Path(key)}`, {
      method: "GET",
      headers: {},
      signal: AbortSignal.timeout(15_000),
    });
    const bodyText = await anon.text().catch(() => "");
    const error = parseS3XmlError(bodyText);
    const bytesLeaked = bodyText.includes(marker) || bodyText.includes(TEXT.toString());
    const verdict = classifyAnonymousRefusal({
      status: anon.status,
      error,
      bytesLeaked,
    });
    record(
      `${label} anon: anonymous GET refused (goal A: object not obtained)`,
      Date.now() - t,
      verdict.pass,
      String(anon.status),
      `s3Code=${error.code ?? "none"} verdict=${verdict.verdict} bytesLeaked=${bytesLeaked} :: ${mask(verdict.reason)}${error.message ? ` | xmlMessage="${mask(error.message)}"` : ""}`
    );
  } catch (error) {
    record(
      `${label} anon: anonymous GET refused (goal A: object not obtained)`,
      Date.now() - t,
      false,
      "ERR",
      classifyNetworkError(error)
    );
  }
}

async function mp4Check(): Promise<void> {
  let mp4: Buffer;
  try {
    mp4 = readFileSync(MP4_PATH);
  } catch (error) {
    record("mp4: fixture load", 0, false, "ERR", mask(String(error)));
    return;
  }

  let t = Date.now();
  let uploaded = false;
  try {
    const put = await s3(PRIVATE_BUCKET, "PUT", MP4_KEY, {
      body: mp4,
      contentType: "video/mp4",
      timeoutMs: 60_000,
    });
    await put.arrayBuffer().catch(() => undefined);
    uploaded = put.status === 200 || put.status === 201;
    record(
      "mp4: upload (PUT video/mp4)",
      Date.now() - t,
      uploaded,
      String(put.status)
    );
    if (uploaded) createdKeys.set(MP4_KEY, PRIVATE_BUCKET);
  } catch (error) {
    record(
      "mp4: upload (PUT video/mp4)",
      Date.now() - t,
      false,
      "ERR",
      mask(String(error instanceof Error ? error.message : error))
    );
  }
  if (!uploaded) return;

  t = Date.now();
  try {
    const head = await s3Read(PRIVATE_BUCKET, "HEAD", MP4_KEY);
    const ct = (head.headers.get("content-type") ?? "").split(";")[0];
    const len = head.headers.get("content-length");
    record(
      "mp4: HEAD metadata (type+length)",
      Date.now() - t,
      head.ok && ct === "video/mp4" && len === String(mp4.length),
      String(head.status),
      `type=${ct} length=${len ?? "?"}`
    );
  } catch (error) {
    record(
      "mp4: HEAD metadata (type+length)",
      Date.now() - t,
      false,
      "ERR",
      classifyNetworkError((error as { cause?: unknown }).cause ?? error)
    );
  }

  t = Date.now();
  try {
    const range = await s3Read(PRIVATE_BUCKET, "GET", MP4_KEY, {
      headers: { Range: "bytes=0-99" },
    });
    const part = Buffer.from(await range.arrayBuffer());
    record(
      "mp4: Range bytes=0-99 (206 + exact bytes)",
      Date.now() - t,
      range.status === 206 &&
        part.length === 100 &&
        part.equals(mp4.subarray(0, 100)) &&
        (range.headers.get("content-range") ?? "").startsWith("bytes 0-99/"),
      String(range.status),
      `content-range=${range.headers.get("content-range") ?? "?"}`
    );
  } catch (error) {
    record(
      "mp4: Range bytes=0-99 (206 + exact bytes)",
      Date.now() - t,
      false,
      "ERR",
      classifyNetworkError((error as { cause?: unknown }).cause ?? error)
    );
  }

  t = Date.now();
  try {
    const full = await s3Read(PRIVATE_BUCKET, "GET", MP4_KEY, {
      timeoutMs: 60_000,
    });
    const bytes = Buffer.from(await full.arrayBuffer());
    const meta = probeMp4Metadata(bytes);
    record(
      "mp4: full download + probe (dims/duration)",
      Date.now() - t,
      full.ok &&
        bytes.length === mp4.length &&
        meta.width !== null &&
        meta.durationSeconds !== null,
      String(full.status),
      `probe=${meta.width}x${meta.height} ${meta.durationSeconds?.toFixed(2)}s`
    );
  } catch (error) {
    record(
      "mp4: full download + probe (dims/duration)",
      Date.now() - t,
      false,
      "ERR",
      classifyNetworkError((error as { cause?: unknown }).cause ?? error)
    );
  }
  // Single-object delete happens in the tracked cleanup.
}

async function main(): Promise<void> {
  console.log("=== WallHaze R2 staging connection acceptance ===");
  console.log(`endpoint: ${maskEndpoint()} (account id masked)`);
  console.log(`buckets: public=${PUBLIC_BUCKET} private=${PRIVATE_BUCKET}`);
  console.log(`prefix:  ${RUN}/ (deployment-test only)`);
  console.log(
    `read-retry: HEAD/GET up to ${READ_ATTEMPTS} attempts on network errors/5xx; PUT/DELETE single-shot\n`
  );

  const missing = [
    !ENDPOINT && "R2_ENDPOINT",
    !ACCESS_KEY_ID && "R2_ACCESS_KEY_ID",
    !SECRET && "R2_SECRET_ACCESS_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    console.error(
      `\nABORT: missing ${missing.join(", ")} — export them (or create ` +
        `apps/api/.env.r2-test, untracked) and re-run. No test executed, nothing faked.`
    );
    process.exit(1);
  }
  if (!/^https:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/i.test(ENDPOINT)) {
    console.error("ABORT: R2_ENDPOINT is not an account-level S3 endpoint URL.");
    process.exit(1);
  }

  try {
    await bucketCycle(PRIVATE_BUCKET, "private-bucket");
    await bucketCycle(PUBLIC_BUCKET, "public-bucket");
    // Goal A (S3 API auth surface) is probed on BOTH buckets: the public
    // bucket is meant for future CLEARED media, but its S3 API must still
    // refuse unsigned reads while public access stays off.
    await anonymousCheck(PRIVATE_BUCKET, "private-bucket");
    await anonymousCheck(PUBLIC_BUCKET, "public-bucket");
    await mp4Check();
  } finally {
    await cleanup();
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(
    `\n=== RESULT: ${results.length - failed}/${results.length} PASS, ${failed} FAIL ===`
  );
  console.log(
    JSON.stringify(
      {
        endpoint: maskEndpoint(),
        buckets: { public: PUBLIC_BUCKET, private: PRIVATE_BUCKET },
        prefix: RUN,
        steps: results.map(({ name, status, ms, pass }) => ({
          name,
          status,
          ms,
          pass,
        })),
      },
      null,
      2
    )
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(
    `FATAL: ${mask(error instanceof Error ? error.message : String(error))}`
  );
  process.exit(1);
});
