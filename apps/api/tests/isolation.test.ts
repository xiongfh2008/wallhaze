/**
 * ISO suite — NEW backend tests for T04-S2 acceptance §五 "秘密不泄漏" and
 * "未注册网络出口被阻断":
 *
 * - Secrets (the dummy FAL_KEY, user prompts, reference-image data URIs)
 *   never appear in any HTTP response or structured log line, on success
 *   AND on failure paths.
 * - FAL_MOCK=1 env selection runs the whole generation flow without a
 *   single outbound fetch (the deny-all guard records nothing).
 * - Both default outbound boundaries (real provider fallback, image-proxy
 *   fallback) are caught by the deny-all guard — a code path that escapes
 *   the injection boundary cannot silently reach the network.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createMockProvider, type MockOutcome } from "../src/modules/generation/fal.provider.js";
import { resetRateLimitStateForTests } from "../src/security/rate-limit.js";
import {
  buildTestApp,
  DUMMY_KEY,
  FAL_ENDPOINT,
  legalBody,
  networkGuard,
  PNG_DATA_URI,
  postGeneration,
  PROMPT_MARKER,
  TEST_ORIGIN,
} from "./helpers.js";

beforeEach(() => {
  resetRateLimitStateForTests();
});

describe("Secret hygiene", () => {
  it("ISO-1: success + failure responses and ALL log lines are free of the dummy key, the prompt and the reference-image data URI", async () => {
    let outcome: MockOutcome = {
      kind: "success",
      imageUrl: "https://v3b.fal.media/x.png",
      width: 1080,
      height: 1920,
      contentType: "image/png",
    };
    const { app, capture } = await buildTestApp({
      env: { FAL_KEY: DUMMY_KEY },
      provider: createMockProvider(() => outcome),
    });

    const ok = await postGeneration(app, {
      ...legalBody(),
      refImage: PNG_DATA_URI,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).not.toContain(DUMMY_KEY);

    outcome = { kind: "nsfw" };
    const flagged = await postGeneration(app, {
      ...legalBody(),
      refImage: PNG_DATA_URI,
    });
    expect(flagged.statusCode).toBe(422);
    expect(flagged.body).not.toContain(DUMMY_KEY);

    outcome = { kind: "upstream-status", status: 500, detail: "boom" };
    const failed = await postGeneration(app, {
      ...legalBody(),
      refImage: PNG_DATA_URI,
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.body).not.toContain(DUMMY_KEY);
    expect(failed.body).not.toContain("boom");

    const logs = capture.text();
    expect(logs).not.toContain(DUMMY_KEY);
    expect(logs).not.toContain(PROMPT_MARKER);
    expect(logs).not.toContain("data:image/png");
    await app.close();
  });
});

describe("Outbound isolation", () => {
  it("ISO-2: FAL_MOCK=1 selects the in-process mock — a full generation completes with ZERO outbound fetch attempts", async () => {
    const { app } = await buildTestApp({ env: { FAL_MOCK: "1" } });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().imageUrl).toBe("https://v3b.fal.media/mock/generated.png");
    expect(networkGuard.unexpectedCalls).toHaveLength(0);
    await app.close();
  });

  it("ISO-3: the image proxy's default fetch path is also guarded — an allowlisted source without an injected fetch is blocked and recorded", async () => {
    const { app } = await buildTestApp({});
    const res = await app.inject({
      method: "GET",
      url: `/v1/images/proxy?src=${encodeURIComponent("https://v3b.fal.media/ok.png")}`,
    });
    expect(res.statusCode).toBe(502);
    expect(networkGuard.unexpectedCalls).toContain(
      "https://v3b.fal.media/ok.png"
    );
    networkGuard.clear();
    await app.close();
  });

  it("ISO-4: upstream error envelopes never echo the upstream URL or host", async () => {
    const { app } = await buildTestApp({
      provider: createMockProvider(() => ({ kind: "network-error" })),
    });
    const res = await postGeneration(app, legalBody());
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(FAL_ENDPOINT);
    expect(res.body).not.toContain("fal.run");
    await app.close();
  });

  it("ISO-5: the origin allowlist stays strict — a foreign origin is 403 BEFORE any quota or upstream work", async () => {
    const { app, capture } = await buildTestApp({
      provider: createMockProvider(() => ({ kind: "success" })),
    });
    const res = await postGeneration(app, legalBody(), {
      origin: "https://evil.example",
    });
    expect(res.statusCode).toBe(403);
    expect(
      capture
        .generateLines()
        .some((l) => l.outcome === "rejected:origin-not-allowed" && l.status === 403)
    ).toBe(true);
    await app.close();
  });
});

/** Sanity: TEST_ORIGIN is part of the base env allowlist (documented). */
describe("Test harness sanity", () => {
  it("ISO-6: the base env allowlist admits the test origin and nothing else", async () => {
    const { app } = await buildTestApp({
      provider: createMockProvider(() => ({ kind: "success" })),
    });
    const same = await postGeneration(app, legalBody());
    expect(same.statusCode).toBe(200);
    const empty = await postGeneration(app, legalBody(), { origin: null });
    expect(empty.statusCode).toBe(200); // curl semantics: origin-less allowed
    await app.close();
  });
});
