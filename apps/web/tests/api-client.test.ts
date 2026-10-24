import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiErrorCode } from "@wallhaze/contracts";
import { apiRequest, resolveApiBaseUrl } from "@/lib/api/client";
import { parseRetryAfter } from "@/lib/api/errors";
import {
  GENERATION_TIMEOUT_MS,
  generateWallpaper,
  type GenerateFailureReason,
  type GenerateOutcome,
} from "@/lib/api/generation";
import { generationErrorCopy } from "@/lib/studio/error-copy";
import { expectNoNetworkCalls, getBlockedNetworkCalls } from "./setup.safety";

/** In-process mock fetch — never touches the network guard. */
function jsonMockFetch(status: number, body: unknown, headers?: Record<string, string>) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    })
  );
}

describe("resolveApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    expect(resolveApiBaseUrl()).toBeNull();
    expect(resolveApiBaseUrl("   ")).toBeNull();
    expect(resolveApiBaseUrl("")).toBeNull();
  });

  it("trims whitespace and strips trailing slashes", () => {
    expect(resolveApiBaseUrl(" https://api.test/ ")).toBe("https://api.test");
    expect(resolveApiBaseUrl("https://api.test///")).toBe("https://api.test");
    expect(resolveApiBaseUrl("https://api.test")).toBe("https://api.test");
  });
});

describe("network guard self-check", () => {
  it("rejects and records unregistered outbound requests", () => {
    expect(() => fetch("https://evil.test/exfiltrate")).toThrow(/network-guard/);
    expect(getBlockedNetworkCalls()).toEqual([
      { url: "https://evil.test/exfiltrate", method: "GET" },
    ]);
  });

  it("records the method of the blocked request", () => {
    expect(() =>
      fetch("https://evil.test/api", { method: "POST" })
    ).toThrow(/network-guard/);
    expect(getBlockedNetworkCalls()[0]?.method).toBe("POST");
  });
});

describe("apiRequest", () => {
  it("returns unavailable without touching fetch when no base URL is configured", async () => {
    const result = await apiRequest<{ ok: boolean }>("/v1/generations", {
      baseUrl: "",
    });
    expect(result).toEqual({
      ok: false,
      failure: { kind: "unavailable" },
      status: null,
    });
    expectNoNetworkCalls();
  });

  it("routes unconfigured-URL calls through the network guard when one is set", async () => {
    // No fetchImpl injected → the global guard applies → outbound blocked.
    const result = await apiRequest("/v1/ping", { baseUrl: "https://api.test" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("network");
    expect(getBlockedNetworkCalls()).toEqual([
      { url: "https://api.test/v1/ping", method: "GET" },
    ]);
  });

  it("sends a typed JSON POST through an injected fetchImpl", async () => {
    const fetchImpl = jsonMockFetch(200, { ok: true });
    const result = await apiRequest<{ ok: boolean }>("/v1/generations", {
      baseUrl: "https://api.test",
      method: "POST",
      body: { device: "phone" },
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.test/v1/generations");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ device: "phone" }));
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
    // The injected mock stays in-process — the guard saw nothing.
    expectNoNetworkCalls();
  });

  it("parses the stable error code and Retry-After from a 429", async () => {
    const fetchImpl = jsonMockFetch(
      429,
      { error: { code: "RATE_LIMITED", message: "slow down" } },
      { "retry-after": "7" }
    );
    const result = await apiRequest("/v1/generations", {
      baseUrl: "https://api.test",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(429);
    expect(result.failure).toEqual({
      kind: "http",
      status: 429,
      code: "RATE_LIMITED",
      message: "slow down",
      retryAfterSeconds: 7,
    });
  });

  it("degrades malformed error bodies to a typed http failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>gateway</html>", { status: 502 }));
    const result = await apiRequest("/v1/generations", {
      baseUrl: "https://api.test",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toEqual({
      kind: "http",
      status: 502,
      code: null,
      message: null,
      retryAfterSeconds: null,
    });
  });
});

describe("parseRetryAfter", () => {
  it("accepts real second values and ceils fractions", () => {
    expect(parseRetryAfter("7")).toBe(7);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("1.9")).toBe(2);
  });

  it("returns null for absent or malformed values", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter("-5")).toBeNull();
  });
});

describe("generateWallpaper", () => {
  const REQUEST = { device: "phone" } as const;

  it("keeps the 150 s client budget above the backend's 120 s upstream timeout", () => {
    expect(GENERATION_TIMEOUT_MS).toBe(150_000);
  });

  it("posts to /v1/generations and resolves a success payload", async () => {
    const fetchImpl = jsonMockFetch(200, {
      imageUrl: "https://cdn.test/wallpaper.png",
      width: 1080,
      height: 1920,
      contentType: "image/png",
    });
    const outcome = await generateWallpaper(REQUEST, {
      baseUrl: "https://api.test",
      fetchImpl,
    });

    expect(outcome).toEqual({
      ok: true,
      imageUrl: "https://cdn.test/wallpaper.png",
      width: 1080,
      height: 1920,
      contentType: "image/png",
    });
    const [url, init] = (fetchImpl as ReturnType<typeof jsonMockFetch>).mock
      .calls[0];
    expect(url).toBe("https://api.test/v1/generations");
    expect(init?.method).toBe("POST");
    expectNoNetworkCalls();
  });

  it("reports invalid when a 2xx body misses the contract", async () => {
    const fetchImpl = jsonMockFetch(200, { surprise: true });
    const outcome = await generateWallpaper(REQUEST, {
      baseUrl: "https://api.test",
      fetchImpl,
    });
    expect(outcome).toEqual({ ok: false, reason: "invalid", message: null });
  });

  it("surfaces the stable error code and Retry-After on http failures", async () => {
    const fetchImpl = jsonMockFetch(
      429,
      { error: { code: "RATE_LIMITED", message: "slow down" } },
      { "retry-after": "7" }
    );
    const outcome = await generateWallpaper(REQUEST, {
      baseUrl: "https://api.test",
      fetchImpl,
    });
    expect(outcome).toEqual({
      ok: false,
      reason: "http",
      message: "slow down",
      code: "RATE_LIMITED",
      retryAfterSeconds: 7,
    });
  });

  it("reports unavailable and sends nothing without a base URL", async () => {
    const outcome = await generateWallpaper(REQUEST, { baseUrl: "" });
    expect(outcome).toEqual({ ok: false, reason: "unavailable", message: null });
    expectNoNetworkCalls();
  });

  it("distinguishes cancel, timeout and network failures", async () => {
    const aborting = vi.fn(async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    });
    const controller = new AbortController();
    controller.abort();
    const canceled = await generateWallpaper(REQUEST, {
      baseUrl: "https://api.test",
      signal: controller.signal,
      fetchImpl: aborting,
    });
    expect(canceled).toEqual({ ok: false, reason: "canceled", message: null });

    const timingOut = vi.fn(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    const timedOut = await generateWallpaper(REQUEST, {
      baseUrl: "https://api.test",
      fetchImpl: timingOut,
    });
    expect(timedOut).toEqual({ ok: false, reason: "timeout", message: null });

    const offline = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const network = await generateWallpaper(REQUEST, {
      baseUrl: "https://api.test",
      fetchImpl: offline,
    });
    expect(network).toEqual({ ok: false, reason: "network", message: null });
  });
});

describe("generationErrorCopy", () => {
  const fail = (
    reason: GenerateFailureReason,
    extra: { code?: ApiErrorCode | null; retryAfterSeconds?: number | null } = {}
  ): Extract<GenerateOutcome, { ok: false }> => ({
    ok: false,
    reason,
    message: null,
    ...extra,
  });

  it("maps typed failure reasons to dedicated keys", () => {
    expect(generationErrorCopy(fail("unavailable"))).toEqual({ key: "apiUnavailable" });
    expect(generationErrorCopy(fail("network"))).toEqual({ key: "networkError" });
    expect(generationErrorCopy(fail("timeout"))).toEqual({ key: "statusTimedOut" });
    expect(generationErrorCopy(fail("canceled"))).toEqual({ key: "statusCanceled" });
    expect(generationErrorCopy(fail("invalid"))).toEqual({ key: "invalidResponse" });
  });

  it("branches on stable error codes, never on message text", () => {
    expect(generationErrorCopy(fail("http", { code: "VALIDATION_ERROR" }))).toEqual({
      key: "errorValidation",
    });
    expect(generationErrorCopy(fail("http", { code: "UNAUTHENTICATED" }))).toEqual({
      key: "errorUnauthenticated",
    });
    expect(generationErrorCopy(fail("http", { code: "FORBIDDEN" }))).toEqual({
      key: "errorForbidden",
    });
    expect(generationErrorCopy(fail("http", { code: "CONTENT_FILTERED" }))).toEqual({
      key: "errorContentFiltered",
    });
    expect(generationErrorCopy(fail("http", { code: "PAYLOAD_TOO_LARGE" }))).toEqual({
      key: "errorPayloadTooLarge",
    });
    expect(generationErrorCopy(fail("http", { code: "UNSUPPORTED_MEDIA_TYPE" }))).toEqual({
      key: "errorUnsupportedMedia",
    });
    expect(generationErrorCopy(fail("http", { code: "UPSTREAM_ERROR" }))).toEqual({
      key: "errorUpstream",
    });
    expect(generationErrorCopy(fail("http", { code: "SERVICE_UNAVAILABLE" }))).toEqual({
      key: "errorServiceUnavailable",
    });
    // Codes without dedicated copy fall back to the generic message.
    expect(generationErrorCopy(fail("http", { code: "NOT_FOUND" }))).toEqual({
      key: "errorGenericHttp",
    });
    expect(generationErrorCopy(fail("http", { code: null }))).toEqual({
      key: "errorGenericHttp",
    });
  });

  it("passes the server's Retry-After through verbatim", () => {
    expect(
      generationErrorCopy(fail("http", { code: "RATE_LIMITED", retryAfterSeconds: 12 }))
    ).toEqual({ key: "errorRateLimited", values: { seconds: 12 } });
    // No invented backoff when the header was absent.
    expect(generationErrorCopy(fail("http", { code: "RATE_LIMITED" })).values).toBeUndefined();
  });
});
