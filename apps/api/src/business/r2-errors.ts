/**
 * Redaction + classification helpers for R2/S3 XML error responses.
 *
 * Used by the R2 storage adapter error paths and the staging acceptance
 * script. Everything here is pure and offline-testable; nothing ever logs
 * credentials (the mask strips endpoints and Credential= fragments).
 */

export interface S3XmlError {
  code: string | null;
  message: string | null;
}

/** Extracts <Code>/<Message> from an S3 XML error body. Tolerant of noise. */
export function parseS3XmlError(body: string): S3XmlError {
  const code = body.match(/<Code>([^<]+)<\/Code>/);
  const message = body.match(/<Message>([^<]*)<\/Message>/);
  return {
    code: code ? code[1] : null,
    message: message ? message[1] : null,
  };
}

/** Strips account endpoints and Credential= fragments from any text. */
export function maskR2Detail(text: string): string {
  return text
    .replace(
      /https:\/\/[a-z0-9-]+\.r2\.cloudflarestorage\.com/gi,
      "https://<account>.r2.cloudflarestorage.com"
    )
    .replace(/Credential=[^\s,/]+/g, "Credential=<masked>")
    .replace(/\b[A-Z0-9]{32}\b/g, "<masked-key>"); // raw access-key shapes
}

export type AnonymousRefusalVerdict =
  | "leak"
  | "auth-required"
  | "protocol-rejection-unsigned"
  | "construction-suspect"
  | "auth-unclear"
  | "other-refusal";

export interface AnonymousRefusalResult {
  pass: boolean;
  verdict: AnonymousRefusalVerdict;
  /** Human explanation for the report (already specific, no blanket 400=PASS). */
  reason: string;
}

/**
 * Classifies an anonymous GET against a REAL object (a signed control read
 * of the same key must have just succeeded — the caller enforces that).
 *
 * Semantics, per the staging acceptance policy:
 *  - Any 2xx, or file bytes in the body, is a LEAK (fail).
 *  - 401/403 is the classic "auth required" refusal (pass).
 *  - 400 + InvalidArgument with no leaked bytes is Cloudflare R2's observed
 *    protocol behavior for UNSIGNED S3 API requests: recorded as
 *    "protocol-rejection-unsigned" (pass for goal A — the object was NOT
 *    obtained) with the explicit caveat that it does NOT prove bucket ACL
 *    (public access lives on r2.dev / custom domains, a separate surface).
 *  - 400 with any OTHER code (InvalidURI, InvalidBucketName, …) suggests a
 *    request-construction problem and FAILS so it gets fixed, not waved
 *    through. A blanket "400 == PASS" is deliberately impossible here.
 *  - 404 right after the signed control read the same key is ambiguous
 *    (auth state unclear) and FAILS.
 */
export function classifyAnonymousRefusal(input: {
  status: number;
  error: S3XmlError;
  bytesLeaked: boolean;
}): AnonymousRefusalResult {
  const { status, error, bytesLeaked } = input;
  const code = error.code;
  if ((status >= 200 && status < 300) || bytesLeaked) {
    return {
      pass: false,
      verdict: "leak",
      reason:
        status >= 200 && status < 300
          ? "LEAK: anonymous read returned a success status"
          : "LEAK: file bytes present in the refusal body",
    };
  }
  if (status === 401 || status === 403) {
    return {
      pass: true,
      verdict: "auth-required",
      reason: `S3 API refused the unsigned request (${status}${code ? `, ${code}` : ""})`,
    };
  }
  if (status === 400 && code === "InvalidArgument") {
    return {
      pass: true,
      verdict: "protocol-rejection-unsigned",
      reason:
        "R2 S3 API protocol-rejected the unsigned request " +
        `(400 InvalidArgument${error.message ? `: ${error.message}` : ""}); ` +
        "object NOT obtained anonymously. NOTE: this proves the S3 API " +
        "refusal only — it is not by itself proof of the bucket ACL " +
        "(public access is a separate r2.dev / custom-domain surface).",
    };
  }
  if (status === 400) {
    return {
      pass: false,
      verdict: "construction-suspect",
      reason:
        `400 with ${code ?? "no S3 code"} — request construction is suspect ` +
        "(not the known unsigned-request refusal); fix the request, not the test",
    };
  }
  if (status === 404) {
    return {
      pass: false,
      verdict: "auth-unclear",
      reason:
        "404 for a key the signed control just read — anonymous behavior is ambiguous",
    };
  }
  return {
    pass: false,
    verdict: "other-refusal",
    reason: `unexpected refusal status ${status}${code ? ` (${code})` : ""}`,
  };
}
