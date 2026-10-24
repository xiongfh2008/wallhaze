import { afterEach, describe, expect, it, vi } from "vitest";
import { createAsyncJobExecutor } from "@/lib/studio/executor";

/**
 * The executor talks to the real transport, so tests inject an in-process
 * fetch. No real network, no paid provider, no credits touched.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const request = { prompt: "a calm sea", device: "desktop" as const };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("async job executor", () => {
  it("creates a job, polls until success and returns the image URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/v1/generations/jobs")) {
        return jsonResponse({ jobId: "job-1", status: "queued", priceCredits: 10 }, 202);
      }
      // queued → running → succeeded
      const polls = calls.filter((c) => c.includes("/v1/generations/jobs/job-1")).length;
      if (polls < 2) {
        return jsonResponse({ jobId: "job-1", status: "running", errorCode: null, priceCredits: 10, imageUrl: null, mock: false, createdAt: "2026-01-01T00:00:00.000Z" });
      }
      return jsonResponse({ jobId: "job-1", status: "succeeded", errorCode: null, priceCredits: 10, imageUrl: "/v1/creations/job-1/image", mock: true, createdAt: "2026-01-01T00:00:00.000Z" });
    }));

    const outcome = await createAsyncJobExecutor({ pollIntervalMs: 1 })(
      request,
      { signal: new AbortController().signal }
    );
    expect(outcome).toMatchObject({ ok: true, imageUrl: "https://api.test/v1/creations/job-1/image", contentType: "image/png", mock: true });
    expect(calls[0]).toBe("https://api.test/v1/generations/jobs");
    expect(calls.some((c) => c.includes("Idempotency"))).toBe(false);
  });

  it("returns the job's stable error code when generation fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/generations/jobs")) {
        return jsonResponse({ jobId: "job-2", status: "queued", priceCredits: 10 }, 202);
      }
      return jsonResponse({ jobId: "job-2", status: "failed", errorCode: "UPSTREAM_ERROR", priceCredits: 10, imageUrl: null, createdAt: "2026-01-01T00:00:00.000Z" });
    }));
    const outcome = await createAsyncJobExecutor({ pollIntervalMs: 1 })(
      request,
      { signal: new AbortController().signal }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("UPSTREAM_ERROR");
  });

  it("surfaces an HTTP guard failure without creating a job", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ error: { code: "RATE_LIMITED", message: "slow down" } }, 429)
    ));
    const outcome = await createAsyncJobExecutor({ pollIntervalMs: 1 })(
      request,
      { signal: new AbortController().signal }
    );
    expect(outcome).toMatchObject({ ok: false, reason: "http", code: "RATE_LIMITED" });
  });

  it("reports unavailable when no API base URL is configured", async () => {
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", transport);
    const outcome = await createAsyncJobExecutor({ pollIntervalMs: 1 })(
      request,
      { signal: new AbortController().signal }
    );
    expect(outcome).toMatchObject({ ok: false, reason: "unavailable" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("maps an aborted signal to canceled before any request", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    const controller = new AbortController();
    controller.abort();
    const outcome = await createAsyncJobExecutor({ pollIntervalMs: 1 })(
      request,
      { signal: controller.signal }
    );
    expect(outcome).toMatchObject({ ok: false, reason: "canceled" });
  });
});
