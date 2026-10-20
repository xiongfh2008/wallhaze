/**
 * RG suite — T04-S2 port of the legacy T03-B1 matrix RG-01..RG-18 for
 * src/security/request-guard.ts.
 *
 * Structural mapping (documented in the T04-S2 mapping table):
 * - RG-01..RG-08 (origin guard) and RG-10..RG-12 (client key) are pure
 *   functions with the same semantics — ported one to one. The allowlist is
 *   now injected (built once at boot from env) instead of read inside the
 *   function, so RG-06 asserts the boot-time composition.
 * - RG-09 and RG-13..RG-18 tested the Web-Request-based readJsonBody /
 *   isJsonContentType helpers. The new pipeline enforces the same rules
 *   inside Fastify (preValidation hook + strict content-type parser +
 *   bodyLimit), so those cases are re-verified BEHAVIORALLY through
 *   app.inject() — the acceptance criterion is the same HTTP outcome.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildOriginAllowlist,
  canonicalOrigin,
  checkRequestOrigin,
  getClientKey,
} from "../src/security/request-guard.js";
import { loadEnv } from "../src/config/env.js";
import { createMockProvider } from "../src/modules/generation/fal.provider.js";
import { resetRateLimitStateForTests } from "../src/security/rate-limit.js";
import {
  buildTestApp,
  legalBody,
  postGeneration,
  TEST_ORIGIN,
} from "./helpers.js";

const LOCAL_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000";

function allowlist(siteUrl?: string): ReadonlySet<string> {
  return buildOriginAllowlist(
    loadEnv({
      CORS_ALLOWED_ORIGINS: LOCAL_ORIGINS,
      ...(siteUrl ? { SITE_URL: siteUrl } : {}),
    })
  );
}

describe("Request Guard — origin checks, unit (RG-01..RG-08)", () => {
  it("RG-01: allows requests with no Origin and no Sec-Fetch-Site header (curl semantics — real existing behavior)", () => {
    const decision = checkRequestOrigin({}, allowlist());
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it("RG-02: rejects Sec-Fetch-Site: cross-site with reason cross-site-fetch-metadata", () => {
    const decision = checkRequestOrigin(
      { "sec-fetch-site": "cross-site", origin: TEST_ORIGIN },
      allowlist(TEST_ORIGIN)
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("cross-site-fetch-metadata");
  });

  it("RG-03: allows same-site metadata with the localhost allowlist origin", () => {
    const decision = checkRequestOrigin(
      { "sec-fetch-site": "same-origin", origin: "http://localhost:3000" },
      allowlist()
    );
    expect(decision.allowed).toBe(true);
  });

  it("RG-04: allows an Origin header pointing at the second local allowlist entry", () => {
    const decision = checkRequestOrigin(
      { origin: "http://127.0.0.1:3000" },
      allowlist()
    );
    expect(decision.allowed).toBe(true);
  });

  it("RG-05: rejects a non-allowlisted Origin", () => {
    const decision = checkRequestOrigin(
      { origin: "https://evil.example" },
      allowlist()
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("origin-not-allowed");
  });

  it("RG-06: SITE_URL extends the allowlist AT BOOT — present when set, absent once cleared (a change now requires a restart, by design)", () => {
    expect(allowlist(TEST_ORIGIN).has(TEST_ORIGIN)).toBe(true);
    expect(allowlist(undefined).has(TEST_ORIGIN)).toBe(false);

    expect(
      checkRequestOrigin({ origin: TEST_ORIGIN }, allowlist(TEST_ORIGIN))
        .allowed
    ).toBe(true);
    expect(
      checkRequestOrigin({ origin: TEST_ORIGIN }, allowlist(undefined)).allowed
    ).toBe(false);
  });

  it("RG-07: ignores a malicious SITE_URL carrying path/credentials — it can never loosen the allowlist", () => {
    const list = allowlist("https://user:pass@evil.example/console");
    expect(list.has("https://evil.example")).toBe(false);
    const decision = checkRequestOrigin(
      { origin: "https://evil.example" },
      list
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("origin-not-allowed");
  });

  it("RG-08: rejects the literal null origin (fails closed, never matches the allowlist)", () => {
    const decision = checkRequestOrigin({ origin: "null" }, allowlist());
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("origin-not-allowed");
  });

  it("RG-08b (new-backend extra): origin comparison is canonical — casing and default ports cannot split or smuggle an origin", () => {
    expect(canonicalOrigin("HTTPS://TEST.WALLHAZE.EXAMPLE")).toBe(TEST_ORIGIN);
    expect(canonicalOrigin("https://test.wallhaze.example:443")).toBe(
      TEST_ORIGIN
    );
  });
});

describe("Request Guard — client key, unit (RG-10..RG-12)", () => {
  it("RG-10: getClientKey returns the fixed 'local' bucket by default and NEVER reads spoofable forwarding headers", () => {
    const headers = { "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" };
    expect(getClientKey(headers, { TRUST_PROXY: undefined })).toBe("local");
  });

  it("RG-11: with TRUST_PROXY=1, the X-Real-IP header becomes the bucket key", () => {
    expect(
      getClientKey({ "x-real-ip": "1.2.3.4" }, { TRUST_PROXY: "1" })
    ).toBe("1.2.3.4");
  });

  it("RG-12: with TRUST_PROXY=1 and a missing header, the key collapses to 'untrusted-direct'", () => {
    expect(getClientKey({}, { TRUST_PROXY: "1" })).toBe("untrusted-direct");
  });
});

describe("Request Guard — body pipeline via inject (framework re-validation of RG-09, RG-13..RG-18)", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
  });

  it("RG-09: content-type handling — parameters accepted, other/missing types answered 415 with the legacy copy before any validation", async () => {
    const happy = createMockProvider();

    // application/json with parameters → accepted end to end.
    const ok = await buildTestApp({ provider: happy });
    const okRes = await postGeneration(
      ok.app,
      legalBody(),
      { contentType: "application/json; charset=utf-8" }
    );
    expect(okRes.statusCode).toBe(200);
    await ok.app.close();

    // text/plain → 415 (registered parser exists; the preValidation hook
    // still rejects it BEFORE the body is used).
    const plain = await buildTestApp({ provider: happy });
    const plainRes = await postGeneration(plain.app, legalBody(), {
      contentType: "text/plain",
    });
    expect(plainRes.statusCode).toBe(415);
    expect(plainRes.json().error.message).toBe(
      "Unsupported content type — expected application/json."
    );
    await plain.app.close();

    // application/xml → unregistered media type → framework 415, same copy.
    const xml = await buildTestApp({ provider: happy });
    const xmlRes = await postGeneration(xml.app, legalBody(), {
      contentType: "application/xml",
    });
    expect(xmlRes.statusCode).toBe(415);
    expect(xmlRes.json().error.message).toBe(
      "Unsupported content type — expected application/json."
    );
    await xml.app.close();

    // No content-type at all (bodyless POST) → 415.
    const none = await buildTestApp({ provider: happy });
    const noneRes = await postGeneration(none.app, undefined, {
      contentType: null,
    });
    expect(noneRes.statusCode).toBe(415);
    await none.app.close();
  });

  it("RG-13: a valid JSON body is parsed and the request completes (200)", async () => {
    const { app } = await buildTestApp({ provider: createMockProvider() });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().imageUrl).toBe("https://v3b.fal.media/mock/generated.png");
    await app.close();
  });

  it("RG-14/GEN-15: a real oversized body (10 MiB + 1 byte) → 413 with the legacy copy and the framework rejection is logged", async () => {
    const { app, capture } = await buildTestApp({
      provider: createMockProvider(),
    });
    const big = JSON.stringify({
      prompt: "z".repeat(11 * 1024 * 1024),
      device: "phone",
    });
    const res = await postGeneration(app, undefined, { rawPayload: big });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.message).toBe(
      "That request is too large — please use a smaller image."
    );
    expect(
      capture
        .outcomeLines()
        .some((l) => l.outcome === "rejected:body-too-large" && l.status === 413)
    ).toBe(true);
    await app.close();
  });

  it("RG-15: a zero-length body → 400 'Invalid request body.' (the strict parser runs even for an empty body: JSON.parse('') throws — identical to the legacy readJsonBody outcome)", async () => {
    const { app } = await buildTestApp({ provider: createMockProvider() });
    const res = await postGeneration(app, undefined, { rawPayload: "" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Invalid request body.");
    await app.close();
  });

  it("RG-16: bytes that are not valid UTF-8 → 400 'Invalid request body.' (strict fatal decoding) and the rejection is logged", async () => {
    const { app, capture } = await buildTestApp({
      provider: createMockProvider(),
    });
    const res = await postGeneration(app, undefined, {
      rawPayload: Buffer.from([0xff, 0xfe, 0x81, 0x8d]),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Invalid request body.");
    expect(
      capture
        .generateLines()
        .some((l) => l.outcome === "rejected:body-invalid" && l.status === 400)
    ).toBe(true);
    await app.close();
  });

  it("RG-17: malformed JSON ('not-json') → 400 'Invalid request body.' — JSON.parse failure mapped by the strict parser", async () => {
    const { app, capture } = await buildTestApp({
      provider: createMockProvider(),
    });
    const res = await postGeneration(app, undefined, {
      rawPayload: "not-json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Invalid request body.");
    expect(
      capture
        .generateLines()
        .some((l) => l.outcome === "rejected:body-invalid")
    ).toBe(true);
    await app.close();
  });

  it("RG-18: a lying Content-Length cannot bypass the cap — small declared length, oversized real bytes → 413 (actual byte count is authoritative)", async () => {
    const { app } = await buildTestApp({ provider: createMockProvider() });
    const big = JSON.stringify({
      prompt: "y".repeat(10 * 1024 * 1024 + 100),
      device: "phone",
    });
    const res = await postGeneration(app, undefined, {
      rawPayload: big,
      contentLength: "10",
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.message).toBe(
      "That request is too large — please use a smaller image."
    );
    await app.close();
  });
});
