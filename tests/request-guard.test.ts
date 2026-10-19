/**
 * RG suite — unit tests for lib/server/request-guard.ts (T03-B1 matrix
 * RG-01..RG-18). Pure-function tests against the Web Request API; no server,
 * no network (the deny-all fetch guard from tests/setup.ts is always active).
 *
 * Every expected status/behavior is taken from the source as of baseline
 * a5fcb90c71c07efece04d8538da2b63f7c97cf14.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRequestOrigin,
  getClientKey,
  isJsonContentType,
  readJsonBody,
} from "@/lib/server/request-guard";

const LOCAL_ORIGIN = "http://localhost:3000";
const TEST_ORIGIN = "https://test.wallhaze.example"; // set in tests/setup.ts

function req(
  headers: Record<string, string> = {},
  body?: BodyInit
): Request {
  return new Request(`${LOCAL_ORIGIN}/api/generate`, {
    method: "POST",
    headers,
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}

function textStream(
  chunks: string[],
  onTerminate?: () => void
): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[i]));
        i += 1;
      } else {
        controller.close();
      }
    },
    cancel() {
      onTerminate?.();
    },
  });
}

describe("Request Guard — origin checks (RG-01..RG-08)", () => {
  beforeEach(() => {
    // Baseline: no SITE_URL beyond the one seeded in tests/setup.ts.
    vi.stubEnv("SITE_URL", TEST_ORIGIN);
  });

  it("RG-01: allows requests with no Origin and no Sec-Fetch-Site header (curl semantics — real existing behavior)", () => {
    const decision = checkRequestOrigin(req());
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it("RG-02: rejects Sec-Fetch-Site: cross-site with reason cross-site-fetch-metadata", () => {
    const decision = checkRequestOrigin(
      req({ "sec-fetch-site": "cross-site", origin: TEST_ORIGIN })
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("cross-site-fetch-metadata");
  });

  it("RG-03: allows same-site metadata with the localhost allowlist origin", () => {
    const decision = checkRequestOrigin(
      req({ "sec-fetch-site": "same-origin", origin: LOCAL_ORIGIN })
    );
    expect(decision.allowed).toBe(true);
  });

  it("RG-04: allows an Origin header pointing at the second local allowlist entry", () => {
    const decision = checkRequestOrigin(
      req({ origin: "http://127.0.0.1:3000" })
    );
    expect(decision.allowed).toBe(true);
  });

  it("RG-05: rejects a non-allowlisted Origin", () => {
    const decision = checkRequestOrigin(
      req({ origin: "https://evil.example" })
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("origin-not-allowed");
  });

  it("RG-06: SITE_URL dynamically extends the allowlist — allowed while set, rejected once cleared", () => {
    expect(
      checkRequestOrigin(req({ origin: TEST_ORIGIN })).allowed
    ).toBe(true);

    vi.stubEnv("SITE_URL", "");
    expect(
      checkRequestOrigin(req({ origin: TEST_ORIGIN })).allowed
    ).toBe(false);
  });

  it("RG-07: ignores a malicious SITE_URL carrying path/credentials — it can never loosen the allowlist", () => {
    vi.stubEnv("SITE_URL", "https://user:pass@evil.example/console");
    const decision = checkRequestOrigin(
      req({ origin: "https://evil.example" })
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("origin-not-allowed");
  });

  it("RG-08: rejects the literal null origin (fails closed, never matches the allowlist)", () => {
    const decision = checkRequestOrigin(req({ origin: "null" }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("origin-not-allowed");
  });
});

describe("Request Guard — content type and client key (RG-09..RG-12)", () => {
  it("RG-09: isJsonContentType accepts application/json with or without parameters and rejects other/missing types", () => {
    expect(isJsonContentType(req({ "content-type": "application/json" }))).toBe(
      true
    );
    expect(
      isJsonContentType(
        req({ "content-type": "application/json; charset=utf-8" })
      )
    ).toBe(true);
    expect(isJsonContentType(req({ "content-type": "text/plain" }))).toBe(
      false
    );
    expect(isJsonContentType(req())).toBe(false);
  });

  it("RG-10: getClientKey returns the fixed 'local' bucket by default and NEVER reads spoofable forwarding headers", () => {
    const request = req({
      "x-real-ip": "1.2.3.4",
      "x-forwarded-for": "5.6.7.8",
    });
    expect(getClientKey(request)).toBe("local");
  });

  it("RG-11: with TRUST_PROXY=1, the X-Real-IP header becomes the bucket key", () => {
    vi.stubEnv("TRUST_PROXY", "1");
    expect(getClientKey(req({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("RG-12: with TRUST_PROXY=1 and a missing header, the key collapses to 'untrusted-direct'", () => {
    vi.stubEnv("TRUST_PROXY", "1");
    expect(getClientKey(req())).toBe("untrusted-direct");
  });
});

describe("Request Guard — readJsonBody (RG-13..RG-18)", () => {
  it("RG-13: reads a valid JSON body and returns the parsed object", async () => {
    const payload = { prompt: "hello", device: "phone" };
    const result = await readJsonBody(
      req({ "content-type": "application/json" }, JSON.stringify(payload)),
      1024
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toEqual(payload);
  });

  it("RG-14: rejects a streaming body beyond maxBytes with 413 and cancels the stream (never reads past the cap)", async () => {
    let cancelled = false;
    const stream = textStream(["a".repeat(50), "b".repeat(50)], () => {
      cancelled = true;
    });
    const result = await readJsonBody(req({}, stream), 64);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error).toBe(
        "That request is too large — please use a smaller image."
      );
    }
    expect(cancelled).toBe(true);
  });

  it("RG-15: returns 400 when the request has no body at all", async () => {
    const result = await readJsonBody(req(), 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("RG-16: returns 400 for bytes that are not valid UTF-8 (strict fatal decoding)", async () => {
    const invalidUtf8 = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff, 0xfe, 0x81, 0x8d]));
        controller.close();
      },
    });
    const result = await readJsonBody(req({}, invalidUtf8), 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("RG-17: returns 400 for an empty body (JSON.parse('') throws)", async () => {
    const result = await readJsonBody(
      req({ "content-type": "application/json" }, ""),
      1024
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("RG-18: a lying Content-Length cannot bypass the streaming cap — small declared length, oversized real stream → 413", async () => {
    const stream = textStream(["x".repeat(50), "y".repeat(50)]);
    const result = await readJsonBody(
      req({ "content-length": "10" }, stream),
      64
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });
});
