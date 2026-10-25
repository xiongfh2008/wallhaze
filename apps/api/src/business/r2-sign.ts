import { createHash, createHmac } from "node:crypto";

/**
 * Minimal AWS SigV4 signing for the S3-compatible R2 API.
 *
 * Zero-dependency on purpose (adding @aws-sdk/client-s3 needs separate
 * approval and ~5MB of runtime deps); R2's surface used by WallHaze is
 * PUT/GET/HEAD/DELETE only, which needs exactly this much of SigV4:
 * path-style addressing, `host` + `x-amz-content-sha256` + `x-amz-date`
 * signed headers, and a full-body SHA-256 (we always hold whole buffers).
 *
 * Region is "auto" — the value Cloudflare documents for account-level S3
 * endpoints (see R2-STORAGE-SETUP.md).
 */

const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** RFC3986-encode a single path segment, preserving "/" separators. */
export function encodeS3Path(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Sorts + encodes query params into the canonical query string. */
export function canonicalQueryString(
  params: Record<string, string> = {}
): string {
  return Object.keys(params)
    .sort()
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
    )
    .join("&");
}

export interface SigV4Request {
  method: "GET" | "HEAD" | "PUT" | "DELETE";
  /** Full URL including the bucket as the first path segment (path-style). */
  url: string;
  body?: Buffer;
  contentType?: string;
  extraHeaders?: Record<string, string>;
  accessKeyId: string;
  secretAccessKey: string;
  /** Override for tests; defaults to now. */
  amzDate?: Date;
}

export interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

const REGION = "auto";
const SERVICE = "s3";

/** Signs a request, returning fetch-ready headers. Pure — no I/O. */
export function signS3Request(request: SigV4Request): SignedRequest {
  const url = new URL(request.url);
  const amzDate =
    request.amzDate ?? new Date();
  const amzStamp = amzDate.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzStamp.slice(0, 8);
  const payloadHash = request.body
    ? sha256Hex(request.body)
    : EMPTY_BODY_SHA256;

  const canonicalUri = encodeS3Path(url.pathname);
  const canonicalQuery = canonicalQueryString(
    Object.fromEntries(url.searchParams.entries())
  );
  const canonicalHeaders =
    `host:${url.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzStamp}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    request.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzStamp,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${request.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const headers: Record<string, string> = {
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${request.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzStamp,
    ...(request.contentType
      ? { "Content-Type": request.contentType }
      : {}),
    ...(request.extraHeaders ?? {}),
  };
  return { url: request.url, method: request.method, headers };
}
