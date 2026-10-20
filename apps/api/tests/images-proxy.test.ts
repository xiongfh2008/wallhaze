/**
 * IMG suite — NEW backend tests for GET /v1/images/proxy (T04-S2 migration
 * of the legacy app/api/image/route.ts, which had no dedicated test file in
 * T03). Every upstream interaction runs through an injected in-process
 * fetch; no test can reach the network (the setup.ts deny-all guard is the
 * backstop). The legacy message copies come from IMAGE_PROXY_ERRORS.
 */
import { describe, expect, it } from "vitest";
import {
  buildTestApp,
  networkGuard,
} from "./helpers.js";
import { IMAGE_PROXY_ERRORS } from "@wallhaze/contracts";

const PROXY_SRC = "https://v3b.fal.media/ok.png";
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

interface Recorder {
  impl: typeof fetch;
  calls: string[];
}

function recorderFetch(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>
): Recorder {
  const calls: string[] = [];
  const impl = ((input: unknown, init?: RequestInit) => {
    const url =
      input instanceof URL ? input : new URL(String(input));
    calls.push(url.href);
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function pngResponse(): Response {
  return new Response(PNG_BYTES, {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

function proxyUrl(src: string | null): string {
  return src === null
    ? "/v1/images/proxy"
    : `/v1/images/proxy?src=${encodeURIComponent(src)}`;
}

describe("GET /v1/images/proxy — source validation (fail closed)", () => {
  it("IMG-01: missing / non-https / non-allowlisted / port / credentials / unparseable sources → 400 without ANY upstream call", async () => {
    const recorder = recorderFetch(() => {
      throw new Error("must not be called for invalid sources");
    });
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });

    const badSources: Array<string | null> = [
      null,
      "not a url",
      "http://v3b.fal.media/ok.png", // not https
      "https://evil.example/ok.png", // host not on the exact allowlist
      "https://sub.v3b.fal.media/ok.png", // no subdomains
      "https://v3b.fal.media:8443/ok.png", // no ports
      "https://user:pass@v3b.fal.media/ok.png", // no credentials
    ];
    for (const src of badSources) {
      const res = await app.inject({ method: "GET", url: proxyUrl(src) });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toBe(
        IMAGE_PROXY_ERRORS.invalidSource
      );
    }
    expect(recorder.calls).toHaveLength(0);
    await app.close();
  });

  it("IMG-02: an allowlisted https source reaches the upstream EXACTLY once with the expected URL", async () => {
    const recorder = recorderFetch(() => pngResponse());
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(200);
    expect(recorder.calls).toEqual([PROXY_SRC]);
    await app.close();
  });
});

describe("GET /v1/images/proxy — happy path and response hygiene", () => {
  it("IMG-03: re-serves sniffed image bytes with immutable caching headers", async () => {
    const recorder = recorderFetch(() => pngResponse());
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("public, max-age=86400");
    expect(res.headers["content-length"]).toBe(String(PNG_BYTES.byteLength));
    expect(Buffer.from(res.rawPayload).equals(Buffer.from(PNG_BYTES))).toBe(
      true
    );
    await app.close();
  });
});

describe("GET /v1/images/proxy — redirect guard", () => {
  it("IMG-04: a redirect to the curated CDN allowlist is followed and re-validated", async () => {
    const recorder = recorderFetch((url) => {
      if (url.hostname === "v3b.fal.media") {
        return new Response(null, {
          status: 301,
          headers: { location: "https://lf-cdn.trae.com.cn/real.png" },
        });
      }
      return pngResponse();
    });
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(200);
    expect(recorder.calls).toEqual([
      PROXY_SRC,
      "https://lf-cdn.trae.com.cn/real.png",
    ]);
    await app.close();
  });

  it("IMG-05: a redirect to a NON-allowlisted host is refused → 502 and the proxy never fetches the smuggled target", async () => {
    const recorder = recorderFetch(() => {
      return new Response(null, {
        status: 301,
        headers: { location: "https://evil.example/steal.png" },
      });
    });
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(IMAGE_PROXY_ERRORS.unreachable);
    expect(recorder.calls).toEqual([PROXY_SRC]); // evil target never fetched
    expect(res.body).not.toContain("evil.example");
    await app.close();
  });

  it("IMG-06: a redirect that downgrades to http is refused → 502", async () => {
    const recorder = recorderFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://lf-cdn.trae.com.cn/x.png" },
        })
    );
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(502);
    expect(recorder.calls).toEqual([PROXY_SRC]);
    await app.close();
  });

  it("IMG-07: a redirect without a Location header → 502 (not followed blindly)", async () => {
    const recorder = recorderFetch(
      () => new Response(null, { status: 302 })
    );
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(IMAGE_PROXY_ERRORS.unreachable);
    await app.close();
  });
});

describe("GET /v1/images/proxy — size, content and upstream failure handling", () => {
  it("IMG-08: an honest Content-Length above 20 MiB → 413 tooLarge without reading the body", async () => {
    const oversized = new Uint8Array(20 * 1024 * 1024 + 1);
    oversized.set(PNG_BYTES);
    const recorder = recorderFetch(() => new Response(oversized));
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.message).toBe(IMAGE_PROXY_ERRORS.tooLarge);
    await app.close();
  });

  it("IMG-09: a lying/absent Content-Length cannot bypass the streaming cap — 21 MiB actually streamed → 413", async () => {
    const chunk = new Uint8Array(7 * 1024 * 1024);
    chunk.set(PNG_BYTES);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const recorder = recorderFetch(
      () => new Response(stream) // no content-length header at all
    );
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.message).toBe(IMAGE_PROXY_ERRORS.tooLarge);
    await app.close();
  });

  it("IMG-10: non-image bytes (HTML with a lying image Content-Type) → 415 unsupported", async () => {
    const html = new TextEncoder().encode("<html>definitely not an image</html>");
    const recorder = recorderFetch(
      () =>
        new Response(html, {
          status: 200,
          headers: { "content-type": "image/png" }, // lie
        })
    );
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.message).toBe(IMAGE_PROXY_ERRORS.unsupported);
    await app.close();
  });

  it("IMG-11: upstream fetch rejects (network failure) → 502 unreachable, internals never leaked", async () => {
    const recorder = recorderFetch(() => {
      throw new Error("ECONNREFUSED by test");
    });
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(IMAGE_PROXY_ERRORS.unreachable);
    expect(res.body).not.toContain("ECONNREFUSED");
    await app.close();
  });

  it("IMG-12: upstream non-2xx (404) → 502 unreachable", async () => {
    const recorder = recorderFetch(
      () => new Response("nope", { status: 404 })
    );
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(IMAGE_PROXY_ERRORS.unreachable);
    await app.close();
  });

  it("IMG-13: an empty 2xx body → 502 unreachable (never an empty image)", async () => {
    const recorder = recorderFetch(
      () => new Response(new Uint8Array(0), { status: 200 })
    );
    const { app } = await buildTestApp({ upstreamFetch: recorder.impl });
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe(IMAGE_PROXY_ERRORS.unreachable);
    await app.close();
  });
});

describe("GET /v1/images/proxy — injection boundary (new-backend isolation)", () => {
  it("IMG-14: with NO injected fetch, the proxy's default global fetch is the deny-all guard → 502 + the attempt is recorded (guard self-verification)", async () => {
    const { app } = await buildTestApp({});
    const res = await app.inject({ method: "GET", url: proxyUrl(PROXY_SRC) });
    expect(res.statusCode).toBe(502);
    expect(networkGuard.unexpectedCalls).toContain(PROXY_SRC);
    // Consume the intentional hit so the global afterEach gate stays clean.
    networkGuard.clear();
    await app.close();
  });
});
