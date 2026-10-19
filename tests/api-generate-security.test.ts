/**
 * GEN suite — in-process integration tests for app/api/generate/route.ts
 * (T03-B1 matrix GEN-01..GEN-28).
 *
 * Execution model (T03-B2 §八):
 * - POST(new Request(...)) is called DIRECTLY in this process. No HTTP
 *   client, no listening server, nothing touches localhost:3000.
 * - The only network exit of the route (globalThis.fetch, route.ts:495) is
 *   owned by the deny-all guard from tests/setup.ts; each upstream-facing
 *   case installs the opt-in fal mock, which whitelists EXACTLY the two
 *   endpoints hardcoded at route.ts:36-37. Any other URL fails the test via
 *   the setup.ts afterEach gate.
 * - FAL_KEY is the fabricated value seeded in tests/setup.ts. The real
 *   .env.local is never read.
 * - Expected statuses/copy are taken verbatim from route.ts at baseline
 *   a5fcb90c71c07efece04d8538da2b63f7c97cf14.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate/route";
import { findSizePreset } from "@/lib/sizes";
import { resetRateLimitStateForTests } from "@/lib/server/rate-limit";

// route.ts does not export its endpoint constants; mirror them verbatim from
// route.ts:36-37 (kept in sync with tests/setup.ts — a mismatch would fail
// the fal-call assertions immediately).
const ROUTE_FAL_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b";
const ROUTE_FAL_EDIT_ENDPOINT = "https://fal.run/fal-ai/flux-2/klein/4b/edit";

const TEST_ORIGIN = "https://test.wallhaze.example"; // seeded in setup.ts
const DUMMY_KEY = "test-dummy-not-a-real-key";
const PROMPT_MARKER = "SECRETPROMPTMARKER42";

interface NetworkHarness {
  unexpectedCalls: { url: string }[];
  falCalls: { url: string; init: RequestInit }[];
  guardActive: boolean;
  installFalMock(
    handler: (url: string, init: RequestInit) => Response | Promise<Response>
  ): void;
  uninstallFalMock(): void;
  clearRecordings(): void;
}

function net(): NetworkHarness {
  const h = (
    globalThis as unknown as { __wallhazeTestNetwork__?: NetworkHarness }
  ).__wallhazeTestNetwork__;
  if (!h) throw new Error("network harness missing — setup.ts did not run");
  return h;
}

/** Minimal legal body: prompt + valid device, no optional fields. */
const LEGAL_BODY = {
  prompt: `${PROMPT_MARKER} a calm neon city skyline wallpaper`,
  device: "phone" as const,
};

/** FalResult shape mirrored from route.ts:78-88 — never invented. */
function falSuccessResponse(): Response {
  return new Response(
    JSON.stringify({
      images: [
        {
          url: "https://img-cdn.test/result-1.png",
          content_type: "image/png",
          width: 1080,
          height: 1920,
        },
      ],
      has_nsfw_concepts: [false],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

interface RequestOptions {
  origin?: string | null;
  secFetchSite?: string;
  realIp?: string;
  contentType?: string | null;
  contentLength?: string;
  body?: BodyInit;
  signal?: AbortSignal;
}

function makeRequest(body: unknown, options: RequestOptions = {}): Request {
  const headers: Record<string, string> = {};
  if (options.contentType !== null) {
    headers["content-type"] = options.contentType ?? "application/json";
  }
  const origin = options.origin === null ? undefined : options.origin ?? TEST_ORIGIN;
  if (origin) headers.origin = origin;
  if (options.secFetchSite) headers["sec-fetch-site"] = options.secFetchSite;
  if (options.realIp) headers["x-real-ip"] = options.realIp;
  if (options.contentLength) headers["content-length"] = options.contentLength;
  const serialized =
    options.body ?? (body === undefined ? undefined : JSON.stringify(body));
  return new Request(`${TEST_ORIGIN}/api/generate`, {
    method: "POST",
    headers,
    body: serialized,
    ...(options.body instanceof ReadableStream ? { duplex: "half" } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

function makeStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Install the standard happy-path fal mock (memory-only responses). */
function installHappyFalMock(): void {
  net().installFalMock(() => falSuccessResponse());
}

/** Extract structured [generate] log lines from a console.log spy. */
function generateLogLines(spy: { mock: { calls: unknown[][] } }):
  Array<{ id: string; outcome: string; status: number; durationMs: number }> {
  return spy.mock.calls
    .map((args) => (typeof args[0] === "string" ? args[0] : ""))
    .filter((line) => line.startsWith("[generate] {"))
    .map((line) => JSON.parse(line.slice("[generate] ".length)));
}

function spyLogs(): {
  log: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
} {
  return {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

/** PNG magic bytes — the exact signature route.ts:110-122 checks. */
const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_DATA_URI = `data:image/png;base64,${Buffer.from(PNG_HEADER).toString("base64")}`;

/**
 * Deterministic wait for a test-synchronization promise with a hard timeout,
 * so a never-signaled mock can never wedge a case until the global 15s cap
 * (the error names the exact missing signal for diagnosis).
 */
async function waitForSync<T>(p: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`test-sync timeout waiting for: ${what}`)),
          5000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

beforeEach(() => {
  // rate-limit state is process-global — every case starts pristine.
  resetRateLimitStateForTests();
});

describe("GEN 1x — success path and FalResult parsing", () => {
  it("GEN-01: legal request returns 200 with imageUrl/width/height/contentType and upstream payload uses the official schema", async () => {
    installHappyFalMock();
    const logs = spyLogs();
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({
      imageUrl: "https://img-cdn.test/result-1.png",
      width: 1080,
      height: 1920,
      contentType: "image/png",
    });

    // Upstream payload — asserted against the actual falPayload construction.
    expect(net().falCalls).toHaveLength(1);
    expect(net().falCalls[0].url).toBe(ROUTE_FAL_ENDPOINT); // text-to-image
    const sent = JSON.parse(String(net().falCalls[0].init.body)) as Record<
      string,
      unknown
    >;
    expect(sent.num_images).toBe(1);
    expect(sent.enable_safety_checker).toBe(true);
    expect(sent.output_format).toBe("png");
    expect(typeof sent.image_size).toBe("string"); // official enum size
    expect(String(sent.prompt)).toContain(PROMPT_MARKER);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-01b: a valid size preset is re-resolved server-side into the official custom {width,height} object", async () => {
    installHappyFalMock();
    const preset = findSizePreset("phone-1080x1920");
    expect(preset).not.toBeNull(); // real built-in id from lib/sizes.ts
    const res = await POST(
      makeRequest({ ...LEGAL_BODY, sizePresetId: "phone-1080x1920" })
    );
    expect(res.status).toBe(200);
    const sent = JSON.parse(String(net().falCalls[0].init.body)) as Record<
      string,
      unknown
    >;
    expect(sent.image_size).toEqual({ width: 1080, height: 1920 });
  });

  it("GEN-02: missing optional FalResult fields degrade to null instead of failing (route.ts:586-588 ?? null)", async () => {
    net().installFalMock(
      () =>
        new Response(
          JSON.stringify({ images: [{ url: "https://img-cdn.test/x.png" }] }),
          { status: 200 }
        )
    );
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.imageUrl).toBe("https://img-cdn.test/x.png");
    expect(json.width).toBeNull();
    expect(json.height).toBeNull();
    expect(json.contentType).toBeNull();
  });

  it("GEN-03: has_nsfw_concepts[0]===true → 422 with the safety-checker copy", async () => {
    net().installFalMock(
      () =>
        new Response(
          JSON.stringify({
            images: [{ url: "https://img-cdn.test/x.png" }],
            has_nsfw_concepts: [true],
          }),
          { status: 200 }
        )
    );
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error:
        "Your prompt was flagged by the safety checker. Please adjust it and try again.",
    });
  });

  it("GEN-04: empty images array → 502 no-image copy", async () => {
    net().installFalMock(
      () =>
        new Response(JSON.stringify({ images: [] }), {
          status: 200,
        })
    );
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "The image service returned no image. Please try again.",
    });
  });
});

describe("GEN 2x — upstream failures and error mapping", () => {
  it("GEN-05: upstream 500 with detail → 502 'Image generation failed.' and provider detail only in server logs", async () => {
    net().installFalMock(
      () =>
        new Response(JSON.stringify({ detail: "upstream boom" }), {
          status: 500,
        })
    );
    const logs = spyLogs();
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Image generation failed. Please try again.",
    });
    // Provider detail goes to server logs, never into the response body.
    expect(logs.error.mock.calls.join(" ")).toContain("upstream boom");
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-06: upstream 429 → 502 with the busy copy (distinct from local concurrency 429)", async () => {
    net().installFalMock(() => new Response("{}", { status: 429 }));
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error:
        "The image service is busy right now. Please try again in a moment.",
    });
  });

  it("GEN-07: upstream 2xx with a non-JSON body → 502 invalid-response", async () => {
    net().installFalMock(
      () => new Response("<html>gateway noise</html>", { status: 200 })
    );
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error:
        "The image service returned an invalid response. Please try again.",
    });
  });

  it("GEN-08: upstream fetch rejects with a generic error → 502 and log outcome upstream:failed", async () => {
    net().installFalMock(() => {
      throw new Error("connection reset by test");
    });
    const logs = spyLogs();
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Could not reach the image service. Please try again.",
    });
    const lines = generateLogLines(logs.log);
    expect(lines.some((l) => l.outcome === "upstream:failed" && l.status === 502)).toBe(true);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-09: simulated upstream abort (AbortError while client signal NOT aborted) → 502 and log outcome upstream:timeout — this verifies ERROR MAPPING, not the real 120s timer", async () => {
    net().installFalMock(() => {
      throw new DOMException("This operation was aborted", "AbortError");
    });
    const logs = spyLogs();
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(502);
    const lines = generateLogLines(logs.log);
    expect(lines.some((l) => l.outcome === "upstream:timeout")).toBe(true);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-10: client disconnect mid-upstream → 502, log outcome upstream:client-aborted, concurrency slot released", async () => {
    let capturedSignal: AbortSignal | null = null;
    // Deterministic sync: resolved only once the mock has ACTUALLY received
    // the upstream fetch, so controller.abort() can never race ahead of it.
    let notifyReached: (() => void) | null = null;
    const reached = new Promise<void>((resolve) => {
      notifyReached = resolve;
    });
    net().installFalMock((_url, init) => {
      capturedSignal = init.signal as AbortSignal;
      notifyReached?.();
      return new Promise((_resolve, reject) => {
        const abort = () =>
          reject(new DOMException("This operation was aborted", "AbortError"));
        // An abort BEFORE fetch resolves may hand us an already-aborted
        // merged signal — the "abort" event never replays, so check first.
        if (capturedSignal?.aborted) {
          abort();
          return;
        }
        capturedSignal?.addEventListener("abort", abort, { once: true });
      });
    });
    const logs = spyLogs();
    const controller = new AbortController();
    const pending = POST(makeRequest(LEGAL_BODY, { signal: controller.signal }));
    await waitForSync(reached, "mock to receive the upstream fetch");
    controller.abort();
    const res = await pending;
    expect(res.status).toBe(502);
    const lines = generateLogLines(logs.log);
    expect(lines.some((l) => l.outcome === "upstream:client-aborted")).toBe(true);

    // finally-block released the slot: a follow-up request succeeds.
    net().uninstallFalMock();
    installHappyFalMock();
    const followUp = await POST(makeRequest(LEGAL_BODY));
    expect(followUp.status).toBe(200);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-11: the route merges the client signal — aborting the request aborts the upstream signal (AbortSignal.any)", async () => {
    let capturedSignal: AbortSignal | null = null;
    // Deterministic sync: wait until the mock has received the fetch (i.e.
    // AbortSignal.any has already run inside the route) BEFORE aborting —
    // otherwise the merged signal is handed over already aborted.
    let notifyReached: (() => void) | null = null;
    const reached = new Promise<void>((resolve) => {
      notifyReached = resolve;
    });
    net().installFalMock((_url, init) => {
      capturedSignal = init.signal as AbortSignal;
      notifyReached?.();
      return new Promise((_resolve, reject) => {
        const abort = () =>
          reject(new DOMException("This operation was aborted", "AbortError"));
        if (capturedSignal?.aborted) {
          abort();
          return;
        }
        capturedSignal?.addEventListener("abort", abort, { once: true });
      });
    });
    expect(capturedSignal).toBeNull();
    const controller = new AbortController();
    const pending = POST(makeRequest(LEGAL_BODY, { signal: controller.signal }));
    await waitForSync(reached, "mock to receive the upstream fetch");
    controller.abort();
    try {
      await pending;
    } catch {
      // POST itself maps aborts to a 502 response; never a thrown error.
      throw new Error("POST must not throw on client disconnect");
    }
    // Read the captured signal through a getter with an explicit return
    // type: TypeScript's control-flow analysis cannot see the assignment
    // inside the mock callback, so the outer-scope `capturedSignal` stays
    // narrowed to `null` and a bare property access errors with TS2339 on
    // `never`. Calling a typed getter restores the declared
    // `AbortSignal | null` type (runtime value is unaffected).
    const getCapturedSignal = (): AbortSignal | null => capturedSignal;
    const observedSignal = getCapturedSignal();
    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedSignal?.aborted).toBe(true);
  });
});

describe("GEN 3x — guard integration (status + copy + log outcome)", () => {
  it("GEN-12: cross-site request → 403 origin copy and log rejected:cross-site-fetch-metadata", async () => {
    const logs = spyLogs();
    const res = await POST(
      makeRequest(LEGAL_BODY, { secFetchSite: "cross-site" })
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Request origin is not allowed",
    });
    expect(
      generateLogLines(logs.log).some(
        (l) => l.outcome === "rejected:cross-site-fetch-metadata" && l.status === 403
      )
    ).toBe(true);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-13: text/plain body → 415 with the content-type copy", async () => {
    const res = await POST(
      makeRequest(LEGAL_BODY, { contentType: "text/plain" })
    );
    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toEqual({
      error: "Unsupported content type — expected application/json.",
    });
  });

  it("GEN-14: Content-Length above 10 MiB → 413 before parsing (pre-check path)", async () => {
    const res = await POST(
      makeRequest(LEGAL_BODY, {
        contentLength: String(10 * 1024 * 1024 + 1),
      })
    );
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      error: "That request is too large — please use a smaller image.",
    });
  });

  it("GEN-15: a real oversized streamed body (no honest length) → 413 and log rejected:body-too-large", async () => {
    const logs = spyLogs();
    const big = new TextEncoder().encode(
      JSON.stringify({ prompt: "z".repeat(11 * 1024 * 1024), device: "phone" })
    );
    const res = await POST(makeRequest(undefined, { body: makeStream(big) }));
    expect(res.status).toBe(413);
    expect(
      generateLogLines(logs.log).some(
        (l) => l.outcome === "rejected:body-too-large" && l.status === 413
      )
    ).toBe(true);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-16: invalid JSON → 400 and log rejected:body-invalid", async () => {
    const logs = spyLogs();
    const res = await POST(
      makeRequest(undefined, { body: new TextEncoder().encode("not-json") })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid request body.",
    });
    expect(
      generateLogLines(logs.log).some(
        (l) => l.outcome === "rejected:body-invalid"
      )
    ).toBe(true);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-17: prompt longer than 800 chars → 400 mentioning the limit", async () => {
    const res = await POST(
      makeRequest({ prompt: "x".repeat(801), device: "phone" })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("800");
  });

  it("GEN-18: invalid device / ratio / preset / style each produce their distinct 400 copy", async () => {
    // device
    const badDevice = await POST(
      makeRequest({ prompt: "p", device: "fridge" })
    );
    expect(badDevice.status).toBe(400);
    await expect(badDevice.json()).resolves.toEqual({
      error: "Choose a device: phone, tablet or desktop.",
    });

    // unsupported ratio
    const badRatio = await POST(
      makeRequest({ prompt: "p", device: "phone", aspectRatio: "7:3" })
    );
    expect(badRatio.status).toBe(400);
    await expect(badRatio.json()).resolves.toEqual({
      error: "That aspect ratio is not available. Please pick another one.",
    });

    // unknown preset id
    const badPreset = await POST(
      makeRequest({ prompt: "p", device: "phone", sizePresetId: "nope" })
    );
    expect(badPreset.status).toBe(400);
    await expect(badPreset.json()).resolves.toEqual({
      error: "That size preset is not available. Please pick another one.",
    });

    // real preset id, wrong device (desktop-1920x1080 is desktop-only)
    expect(findSizePreset("desktop-1920x1080")?.device).toBe("desktop");
    const presetDevice = await POST(
      makeRequest({
        prompt: "p",
        device: "phone",
        sizePresetId: "desktop-1920x1080",
      })
    );
    expect(presetDevice.status).toBe(400);
    await expect(presetDevice.json()).resolves.toEqual({
      error: "That size preset is not available for this device.",
    });

    // preset and explicit ratio disagree (phone-1080x1920 is 9:16)
    const ratioPreset = await POST(
      makeRequest({
        prompt: "p",
        device: "phone",
        sizePresetId: "phone-1080x1920",
        aspectRatio: "1:1",
      })
    );
    expect(ratioPreset.status).toBe(400);
    await expect(ratioPreset.json()).resolves.toEqual({
      error:
        "The selected size preset does not match the selected aspect ratio.",
    });

    // unknown style id
    const badStyle = await POST(
      makeRequest({ prompt: "p", device: "phone", styleId: "no-such-style" })
    );
    expect(badStyle.status).toBe(400);
    await expect(badStyle.json()).resolves.toEqual({
      error: "That style is not available. Please pick another one.",
    });
  });

  it("GEN-18b: no prompt, no style, no reference → 400 empty-input copy", async () => {
    const res = await POST(makeRequest({ device: "phone" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Add a prompt or pick a style first.",
    });
  });
});

describe("GEN 4x — reference image pipeline", () => {
  it("GEN-19: a valid PNG data URI routes to the EDIT endpoint with image_urls and the edit base instruction", async () => {
    installHappyFalMock();
    // Reference-only (no prompt, no style) → EDIT_BASE_INSTRUCTION composes.
    const res = await POST(
      makeRequest({ device: "phone", refImage: PNG_DATA_URI })
    );
    expect(res.status).toBe(200);
    expect(net().falCalls[0].url).toBe(ROUTE_FAL_EDIT_ENDPOINT);
    const sent = JSON.parse(String(net().falCalls[0].init.body)) as Record<
      string,
      unknown
    >;
    expect(sent.image_urls).toEqual([PNG_DATA_URI]);
    expect(String(sent.prompt)).toBe(
      "Transform the reference image into a wallpaper"
    );
  });

  it("GEN-19b: unsupported MIME (gif) → 400 format copy", async () => {
    const res = await POST(
      makeRequest({
        device: "phone",
        refImage: "data:image/gif;base64,AAAA",
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Unsupported image format — use PNG, JPEG or WebP.",
    });
  });

  it("GEN-19c: malformed data URI → 400 could-not-read copy", async () => {
    const res = await POST(
      makeRequest({
        device: "phone",
        refImage: "data:image/png;base64,@@@not-base64@@@",
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That reference image could not be read. Please re-upload it.",
    });
  });

  it("GEN-19d: base64 payload beyond 5 MiB decoded → 413 size copy", async () => {
    const bigBytes = new Uint8Array(5 * 1024 * 1024 + 1024);
    bigBytes.set(PNG_HEADER); // passes magic bytes, fails the 5 MiB cap
    const res = await POST(
      makeRequest({
        device: "phone",
        refImage: `data:image/png;base64,${Buffer.from(bigBytes).toString("base64")}`,
      })
    );
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      error: "Reference image is too large — please keep it under 5 MB.",
    });
  });

  it("GEN-19e: declared PNG whose bytes are not a PNG → 400 magic-byte copy", async () => {
    const fakeBytes = new TextEncoder().encode("definitely not a png image");
    const res = await POST(
      makeRequest({
        device: "phone",
        refImage: `data:image/png;base64,${Buffer.from(fakeBytes).toString("base64")}`,
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error:
        "The reference image is invalid or its format does not match the declared type.",
    });
  });
});

describe("GEN 5x — pause switch, key absence, log hygiene", () => {
  it("GEN-20: GENERATION_PAUSED=1 → 503 paused copy and log outcome paused", async () => {
    vi.stubEnv("GENERATION_PAUSED", "1");
    const logs = spyLogs();
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error:
        "Image generation is paused by the server. Please try again later.",
    });
    expect(generateLogLines(logs.log).some((l) => l.outcome === "paused")).toBe(
      true
    );
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-21: missing FAL_KEY → 503 not-configured copy (branch has no log line — asserted as such)", async () => {
    vi.stubEnv("FAL_KEY", "");
    const logs = spyLogs();
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "AI generation is not configured yet. Please try again later.",
    });
    expect(generateLogLines(logs.log)).toHaveLength(0); // honest branch shape
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-26: structured logs never contain the dummy key, the prompt marker or reference-image data; every line parses with id/outcome/status/durationMs", async () => {
    installHappyFalMock();
    const logs = spyLogs();
    // One success, one cross-site rejection, one upstream failure.
    await POST(makeRequest(LEGAL_BODY));
    await POST(makeRequest(LEGAL_BODY, { secFetchSite: "cross-site" }));
    net().uninstallFalMock();
    net().installFalMock(() => {
      throw new Error("test upstream failure");
    });
    await POST(makeRequest(LEGAL_BODY));

    const all = [...logs.log.mock.calls, ...logs.error.mock.calls]
      .map((args) => args.map(String).join(" "))
      .join("\n");
    expect(all).not.toContain(DUMMY_KEY);
    expect(all).not.toContain(PROMPT_MARKER);
    expect(all).not.toContain("data:image/png");

    const structured = generateLogLines(logs.log);
    expect(structured.length).toBeGreaterThanOrEqual(3);
    for (const line of structured) {
      expect(typeof line.id).toBe("string");
      expect(line.id).not.toContain(DUMMY_KEY);
      expect(typeof line.outcome).toBe("string");
      expect(typeof line.status).toBe("number");
      expect(typeof line.durationMs).toBe("number");
    }
    logs.log.mockRestore();
    logs.error.mockRestore();
  });
});

describe("GEN 6x — limiter integration through the real pipeline", () => {
  it("GEN-22: the 11th request from the same bucket within 60s hits the SHORT-WINDOW branch (429 + Retry-After ≤ 60 + log rejected:short-window); the first 10 succeed", async () => {
    installHappyFalMock();
    const logs = spyLogs();
    for (let i = 1; i <= 10; i += 1) {
      const res = await POST(makeRequest(LEGAL_BODY));
      expect(res.status).toBe(200);
    }
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error:
        "Too many requests — please slow down and try again in a moment.",
    });
    const retryAfter = res.headers.get("retry-after");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    expect(Number(retryAfter)).toBeLessThanOrEqual(60);
    expect(
      generateLogLines(logs.log).some(
        (l) => l.outcome === "rejected:short-window"
      )
    ).toBe(true);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-23: the 31st submission of one client hits the DAILY-QUOTA branch (429 + Retry-After = seconds to UTC midnight + log rejected:daily-quota), using controlled clock advance to cross each 60s short window without crossing the UTC day", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    installHappyFalMock();
    const logs = spyLogs();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.UTC(2026, 0, 1, 10, 0, 0)); // 14h before midnight

      for (let round = 0; round < 3; round += 1) {
        for (let i = 0; i < 10; i += 1) {
          const res = await POST(
            makeRequest(LEGAL_BODY, { realIp: "10.9.9.9" })
          );
          expect(res.status).toBe(200);
        }
        // Cross the 60s short window; still 2026-01-01 UTC → quota not reset.
        vi.advanceTimersByTime(61_000);
      }

      const res = await POST(makeRequest(LEGAL_BODY, { realIp: "10.9.9.9" }));
      expect(res.status).toBe(429);
      await expect(res.json()).resolves.toEqual({
        error:
          "You've reached today's generation limit. Please try again tomorrow.",
      });
      // Retry-After must reflect the CURRENT fake clock: we started at
      // 10:00:00Z (14h to UTC midnight) and advanced 3×61s across the short
      // windows, so the remaining time is 50400 − 183 = 50217s. Computed
      // from the live fake clock instead of a hardcoded constant.
      const nowMs = Date.now();
      const nextUtcMidnight = Date.UTC(2026, 0, 2, 0, 0, 0);
      const expectedRetryAfter = String(
        Math.ceil((nextUtcMidnight - nowMs) / 1000)
      );
      expect(res.headers.get("retry-after")).toBe(expectedRetryAfter);
      expect(expectedRetryAfter).toBe("50217"); // sanity: 14h − 3×61s
      expect(
        generateLogLines(logs.log).some(
          (l) => l.outcome === "rejected:daily-quota"
        )
      ).toBe(true);
    } finally {
      vi.useRealTimers();
      logs.log.mockRestore();
      logs.error.mockRestore();
    }
  });

  it("GEN-24: the 201st GLOBAL submission hits the GLOBAL-BUDGET branch (503 + copy + Retry-After + log rejected:daily-budget) — 201 distinct trusted-proxy IPs keep per-bucket limits untouched; NO time travel", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    installHappyFalMock();
    const logs = spyLogs();
    for (let i = 1; i <= 200; i += 1) {
      const res = await POST(
        makeRequest(LEGAL_BODY, { realIp: `10.0.${Math.floor(i / 250)}.${i % 250 || 1}` })
      );
      expect(res.status).toBe(200);
    }
    const res = await POST(
      makeRequest(LEGAL_BODY, { realIp: "10.0.200.201" })
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error:
        "The image service has reached today's request limit. Please try again tomorrow.",
    });
    const retryAfter = res.headers.get("retry-after");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    expect(
      generateLogLines(logs.log).some(
        (l) => l.outcome === "rejected:daily-budget" && l.status === 503
      )
    ).toBe(true);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });

  it("GEN-25: the 4th concurrent submission hits the CONCURRENCY branch (429 busy copy, NO Retry-After, log rejected:concurrency); releasing a slot lets the next request succeed", async () => {
    const logs = spyLogs();
    const resolvers: Array<(res: Response) => void> = [];
    // Deterministic sync: resolved once the first THREE upstream calls have
    // actually reached the mock (and thus hold all three concurrency slots),
    // so the 4th request's 429 can never race ahead of them.
    let reachedCount = 0;
    let notifyAllReached: (() => void) | null = null;
    const allReached = new Promise<void>((resolve) => {
      notifyAllReached = resolve;
    });
    net().installFalMock(() => {
      reachedCount += 1;
      if (reachedCount === 3) notifyAllReached?.();
      return new Promise<Response>((resolve) => {
        resolvers.push(resolve);
      });
    });

    const pending = [
      POST(makeRequest(LEGAL_BODY)),
      POST(makeRequest(LEGAL_BODY)),
      POST(makeRequest(LEGAL_BODY)),
    ];
    await waitForSync(allReached, "three upstream calls to reach the mock");
    const fourth = await POST(makeRequest(LEGAL_BODY));
    expect(fourth.status).toBe(429);
    await expect(fourth.json()).resolves.toEqual({
      error: "The image service is busy right now. Please try again in a moment.",
    });
    expect(fourth.headers.get("retry-after")).toBeNull();
    expect(
      generateLogLines(logs.log).some(
        (l) => l.outcome === "rejected:concurrency"
      )
    ).toBe(true);

    // Finish the three in-flight upstream calls → slots released via finally.
    const okResponse = falSuccessResponse();
    for (const resolve of resolvers) resolve(okResponse.clone());
    const settled = await Promise.all(pending);
    for (const res of settled) expect(res.status).toBe(200);

    // A released slot admits a new request. The delayed handler must NOT
    // serve this 5th upstream call — its new resolver would never be
    // invoked and the request would hang forever — so swap in the
    // instantly-resolving happy-path mock first.
    expect(settled.length).toBe(3);
    installHappyFalMock();
    const fifth = await POST(makeRequest(LEGAL_BODY));
    expect(fifth.status).toBe(200);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });
});

describe("GEN 7x — network guard self-verification", () => {
  it("GEN-28: with NO fal mock installed, an outbound attempt is blocked by the guard, recorded as unexpected, and the route maps it to 502 — proving the guard actually intercepts", async () => {
    const logs = spyLogs();
    const res = await POST(makeRequest(LEGAL_BODY));
    expect(res.status).toBe(502); // route caught the guard rejection
    const unexpected = net().unexpectedCalls.map((c) => c.url);
    expect(unexpected).toContain(ROUTE_FAL_ENDPOINT);
    expect(net().guardActive).toBe(true);
    // Consume the intentional hit so the global afterEach gate stays clean.
    net().clearRecordings();
    logs.log.mockRestore();
    logs.error.mockRestore();
  });
});

describe("GEN-27 (SKIPPED by default) — real 120-second AbortSignal.timeout", { skip: true }, () => {
  // To actually run this case (~125s, still zero cost because the upstream is
  // a hanging in-process mock): remove `skip: true` or run with
  // `npx vitest run -t "GEN-27" --testTimeout 200000`.
  it("GEN-27: a hanging upstream is aborted by the merged timeout signal after ~120s → 502 + log outcome upstream:timeout", async () => {
    let capturedSignal: AbortSignal | null = null;
    net().installFalMock((_url, init) => {
      capturedSignal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        capturedSignal?.addEventListener("abort", () => {
          reject(new DOMException("This operation was aborted", "AbortError"));
        });
      });
    });
    const logs = spyLogs();
    const startedAt = Date.now();
    const res = await POST(makeRequest(LEGAL_BODY));
    const elapsed = Date.now() - startedAt;
    expect(res.status).toBe(502);
    expect(elapsed).toBeGreaterThanOrEqual(119_000);
    expect(elapsed).toBeLessThan(150_000);
    expect(
      generateLogLines(logs.log).some((l) => l.outcome === "upstream:timeout")
    ).toBe(true);
    logs.log.mockRestore();
    logs.error.mockRestore();
  });
});
