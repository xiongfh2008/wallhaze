import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { credit, getWallet } from "../src/business/wallet.js";
import { enqueueJob } from "../src/business/jobs.js";
import { runWorkerOnce } from "../src/business/worker.js";
import {
  MAX_PROMPT_CHARS,
  PromptModerationService,
} from "../src/business/moderation.js";
import {
  OutputModerationService,
  frameOffsets,
} from "../src/business/output-moderation.js";
import { buildApp } from "../src/app.js";
import { PNG_DATA_URI, TEST_ORIGIN } from "./helpers.js";
import { parseBlocklist, matchBlocklist } from "../src/business/blocklist.js";
import { MockJobProvider } from "../src/business/providers.js";
import { MemoryStorage } from "../src/business/storage.js";
import type { JobProvider } from "../src/business/providers.js";
import { rescanPublishedGallery } from "../src/business/gallery-moderation.js";

/**
 * Waffo moderation chain tests (phase-2 remediation):
 *  - Prompt Sift client implements the OFFICIAL scan-prompt contract
 *    (RSA-SHA256 X-Merchant-Id/X-Timestamp/X-Signature signing, allow/
 *    review/block verdicts, official retry policy, hold-and-retry for
 *    review — no result-query API exists);
 *  - local blocklist layer;
 *  - output moderation (image + video frames) with fail-closed semantics;
 *  - worker integration: blocked prompts never reach the provider;
 *    rejected output is never stored; providerBilled semantics match the
 *    two credit scenarios (pre-generation reject vs post-generation reject).
 */

const SCAN_PATH = "/v1/actions/verification/scan-prompt";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const PUBLIC_KEY = createPublicKey(
  publicKey.export({ type: "spki", format: "pem" })
);

const instantSleep = () => Promise.resolve();

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const waffoVerdict = (data: unknown, status = 200) =>
  jsonResponse({ data }, status);

const openaiVerdict = (flagged: boolean, categories: Record<string, boolean> = {}) =>
  jsonResponse({ results: [{ flagged, categories }] });

/** Rate-limited response carrying an official Retry-After header. */
const rateLimited = (retryAfter: string) =>
  new Response(JSON.stringify({}), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": retryAfter },
  });

/** Provider stub that records calls and fails the test if invoked. */
function neverCalledProvider(calls: string[]): JobProvider {
  return {
    async generate() {
      calls.push("generate");
      throw new Error("PROVIDER_MUST_NOT_BE_CALLED");
    },
  };
}

describe("PromptModerationService (official scan-prompt contract)", () => {
  it("is disabled without merchant credentials and sends nothing", async () => {
    let requests = 0;
    const service = new PromptModerationService({
      merchantId: null,
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => {
        requests += 1;
        return waffoVerdict({ action: "allow" });
      },
    });
    expect(service.enabled).toBe(false);
    const result = await service.scan("anything");
    expect(result).toMatchObject({ action: "unavailable", status: null });
    expect(requests).toBe(0);
  });

  it("signs requests per the official canonical form (verifiable RSA-SHA256)", async () => {
    let seen: { url: string; headers: Record<string, string>; body: string } | null = null;
    const service = new PromptModerationService({
      merchantId: "MER_test",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async (url, init) => {
        seen = {
          url: String(url),
          headers: init?.headers as Record<string, string>,
          body: String(init?.body),
        };
        return waffoVerdict({ action: "allow", requestId: "REQ_1" });
      },
    });
    const result = await service.scan("a wallpaper of mountains");
    expect(result).toMatchObject({ action: "allow", requestId: "REQ_1", heldMs: 0 });
    expect(seen!.url.endsWith(SCAN_PATH)).toBe(true);
    expect(seen!.headers["X-Merchant-Id"]).toBe("MER_test");
    expect(/^\d+$/.test(seen!.headers["X-Timestamp"])).toBe(true);
    expect(seen!.headers["X-Signature"]).toBeTruthy();

    // Recompute the canonical request per the docs and verify the
    // signature cryptographically with the matching public key.
    const bodyHash = createHash("sha256").update(seen!.body, "utf8").digest("base64");
    const canonical = [
      "POST",
      SCAN_PATH,
      seen!.headers["X-Timestamp"],
      bodyHash,
    ].join("\n");
    const valid = cryptoVerify(
      "sha256",
      Buffer.from(canonical, "utf8"),
      PUBLIC_KEY,
      Buffer.from(seen!.headers["X-Signature"], "base64")
    );
    expect(valid).toBe(true);
    expect(JSON.parse(seen!.body)).toEqual({
      prompt: "a wallpaper of mountains",
      locale: "en",
      semantic: "enforce",
    });
  });

  it("normalizes allow/review/block verdicts with categories", async () => {
    const make = (data: unknown) =>
      new PromptModerationService({
        merchantId: "MER_test",
        privateKey: PRIVATE_KEY_PEM,
        fetcher: async () => waffoVerdict(data),
      });
    expect((await make({ action: "allow", reasonCode: "allowed" }).scan("p")).action).toBe("allow");
    expect(
      await make({ action: "block", reasonCode: "restricted_content", matchedCategories: ["csam", "nsfw"], requestId: "REQ_2" }).scan("p")
    ).toMatchObject({ action: "block", categories: ["csam", "nsfw"], requestId: "REQ_2" });
    expect((await make({ action: "review", reasonCode: "review_required" }).scan("p")).action).toBe("review");
    expect(
      (await make({ action: "review", reasonCode: "service_degraded" }).scan("p")).reasonCode
    ).toBe("service_degraded");
  });

  it("fails closed on unknown shapes, HTTP errors and transport failures", async () => {
    const shape = new PromptModerationService({
      merchantId: "MER",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => jsonResponse({ verdict: "looks-fine" }),
    });
    expect((await shape.scan("p")).action).toBe("unavailable");

    const http = new PromptModerationService({
      merchantId: "MER",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => waffoVerdict({ action: "allow" }, 403),
      sleep: instantSleep,
    });
    const httpResult = await http.scan("p");
    expect(httpResult).toMatchObject({ action: "unavailable", status: 403 });

    const network = new PromptModerationService({
      merchantId: "MER",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => {
        throw new Error("ECONNRESET detail that must not escape");
      },
      sleep: instantSleep,
    });
    expect(await network.scan("p")).toMatchObject({ action: "unavailable", status: null });
  });

  it("retries 5xx per the official policy and never retries 4xx", async () => {
    let calls500 = 0;
    const serverError = new PromptModerationService({
      merchantId: "MER",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => {
        calls500 += 1;
        return waffoVerdict({ action: "allow" }, 500);
      },
      sleep: instantSleep,
    });
    expect((await serverError.scan("p")).action).toBe("unavailable");
    expect(calls500).toBe(3); // initial + 2 retries

    let calls400 = 0;
    const badRequest = new PromptModerationService({
      merchantId: "MER",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => {
        calls400 += 1;
        return waffoVerdict({ action: "allow" }, 400);
      },
      sleep: instantSleep,
    });
    expect((await badRequest.scan("p")).action).toBe("unavailable");
    expect(calls400).toBe(1);

    let calls429 = 0;
    const rateLimitedService = new PromptModerationService({
      merchantId: "MER",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => {
        calls429 += 1;
        return calls429 < 2
          ? rateLimited("2")
          : waffoVerdict({ action: "allow" });
      },
      sleep: instantSleep,
    });
    expect((await rateLimitedService.scan("p")).action).toBe("allow");
    expect(calls429).toBe(2);
  });

  it("refuses unscreenable prompts without any request", async () => {
    let requests = 0;
    const service = new PromptModerationService({
      merchantId: "MER",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => {
        requests += 1;
        return waffoVerdict({ action: "allow" });
      },
    });
    expect((await service.scan("x".repeat(MAX_PROMPT_CHARS + 1))).reasonCode).toBe(
      "prompt_out_of_range"
    );
    expect(requests).toBe(0);
  });

  it("holds verdict=review and re-scans; unresolved reviews stay review", async () => {
    let scans = 0;
    const resolves = new PromptModerationService({
      merchantId: "MER",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => {
        scans += 1;
        return waffoVerdict(scans < 3 ? { action: "review" } : { action: "allow" });
      },
      reviewMaxWaitMs: 60_000,
      reviewRetryDelayMs: 30_000,
      sleep: instantSleep,
    });
    const resolved = await resolves.scanWithHold("p");
    expect(resolved.action).toBe("allow");
    expect(resolved.heldMs).toBeGreaterThan(0);

    const stuck = new PromptModerationService({
      merchantId: "MER",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => waffoVerdict({ action: "review" }),
      reviewMaxWaitMs: 10,
      reviewRetryDelayMs: 5,
      sleep: instantSleep,
    });
    const unresolved = await stuck.scanWithHold("p");
    // Waffo provides no query/callback endpoint: an unresolved review must
    // surface as "review" so the caller fails closed instead of generating.
    expect(unresolved.action).toBe("review");
  });
});

describe("local blocklist", () => {
  it("matches the six categories case-insensitively across whitespace", () => {
    expect(matchBlocklist("A serene  POKEMON  PIKACHU  wallpaper")).toContain("ip");
    expect(matchBlocklist("make it  DEEPFAKE  style")).toContain("deepfake");
    const nsfw = matchBlocklist("totally safe mountain landscape");
    expect(nsfw).toEqual([]);
  });

  it("rejects malformed blocklist data", () => {
    expect(() => parseBlocklist({})).toThrow(/version|updatedAt|categories/);
    expect(() => parseBlocklist({ version: 1, updatedAt: "2026-10-31", categories: { nsfw: [] } })).toThrow(/non-empty/);
  });
});

describe("OutputModerationService", () => {
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");

  it("is disabled without an API key and fails closed", async () => {
    const service = new OutputModerationService({ apiKey: null });
    expect(service.enabled).toBe(false);
    expect(await service.screenImage({ bytes: png, mime: "image/png" })).toMatchObject({
      action: "unavailable",
    });
    expect(
      await service.screenVideo({ bytes: png, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "unavailable" });
  });

  it("screens images: allow, block with flagged categories, and fail closed", async () => {
    const allow = new OutputModerationService({
      apiKey: "k",
      fetcher: async () => openaiVerdict(false),
    });
    expect(await allow.screenImage({ bytes: png, mime: "image/png" })).toMatchObject({
      action: "allow",
    });

    const block = new OutputModerationService({
      apiKey: "k",
      fetcher: async () =>
        openaiVerdict(true, { sexual: true, "sexual/minors": true, violence: false }),
    });
    expect(await block.screenImage({ bytes: png, mime: "image/png" })).toMatchObject({
      action: "block",
      categories: ["sexual", "sexual/minors"],
    });

    const httpError = new OutputModerationService({
      apiKey: "k",
      fetcher: async () => jsonResponse({}, 503),
    });
    expect(await httpError.screenImage({ bytes: png, mime: "image/png" })).toMatchObject({
      action: "unavailable",
      status: 503,
    });

    const badShape = new OutputModerationService({
      apiKey: "k",
      fetcher: async () => jsonResponse({ nope: true }),
    });
    expect(await badShape.screenImage({ bytes: png, mime: "image/png" })).toMatchObject({
      action: "unavailable",
    });

    const network = new OutputModerationService({
      apiKey: "k",
      fetcher: async () => {
        throw new Error("reset by peer");
      },
    });
    expect(await network.screenImage({ bytes: png, mime: "image/png" })).toMatchObject({
      action: "unavailable",
      status: null,
    });
  });

  it("screens videos frame by frame: any flagged frame blocks, unscreenable fails closed", async () => {
    const frames = [png, png, png];
    const extractor = async () => frames;

    const allow = new OutputModerationService({
      apiKey: "k",
      frameExtractor: extractor,
      fetcher: async () => openaiVerdict(false),
    });
    expect(
      await allow.screenVideo({ bytes: png, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "allow" });

    let call = 0;
    const blockMidVideo = new OutputModerationService({
      apiKey: "k",
      frameExtractor: extractor,
      fetcher: async () => {
        call += 1;
        return openaiVerdict(call === 2, { sexual: true });
      },
    });
    expect(
      await blockMidVideo.screenVideo({ bytes: png, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "block", categories: ["sexual"] });

    const extractorDown = new OutputModerationService({
      apiKey: "k",
      frameExtractor: async () => {
        throw new Error("ffmpeg missing");
      },
      fetcher: async () => openaiVerdict(false),
    });
    expect(
      await extractorDown.screenVideo({ bytes: png, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "unavailable" });

    const emptyFrames = new OutputModerationService({
      apiKey: "k",
      frameExtractor: async () => [],
      fetcher: async () => openaiVerdict(false),
    });
    expect(
      await emptyFrames.screenVideo({ bytes: png, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "unavailable" });

    // One blocked frame + one unscreenable frame → block wins.
    let mixedCall = 0;
    const mixed = new OutputModerationService({
      apiKey: "k",
      frameExtractor: async () => [png, png, png],
      fetcher: async () => {
        mixedCall += 1;
        return mixedCall === 1
          ? openaiVerdict(true, { violence: true })
          : jsonResponse({}, 500);
      },
    });
    expect(
      await mixed.screenVideo({ bytes: png, mime: "video/mp4", durationSeconds: 5 })
    ).toMatchObject({ action: "block", categories: ["violence"] });
  });
});

describe("worker moderation chain (live runtime)", () => {
  let db: Database;
  beforeEach(async () => {
    db = await createMemoryDatabase();
    await migrate(db);
    await db.query("insert into users(id,email,password_hash) values ('u','u@x','x')");
    await db.transaction((tx) => credit(tx, 'u', 50, 'seed', 'purchase'));
  });
  afterEach(async () => {
    await db.close();
  });

  const enqueue = (key: string, prompt = "a wallpaper") =>
    enqueueJob(db, {
      userId: "u",
      idempotencyKey: key,
      request: { prompt, device: "desktop" },
      inputHash: "hash-" + key,
      price: 5,
      costMicros: 100,
    });

  const moderationWith = (data: unknown) =>
    new PromptModerationService({
      merchantId: "MER_test",
      privateKey: PRIVATE_KEY_PEM,
      fetcher: async () => waffoVerdict(data),
    });

  const outputWith = (flagged: boolean, categories: Record<string, boolean> = {}) =>
    new OutputModerationService({
      apiKey: "test-key",
      fetcher: async () => openaiVerdict(flagged, categories),
    });

  const walletCounts = async () => {
    const wallet = await getWallet(db, "u");
    return { credits: wallet.credits, reserved: wallet.reserved };
  };

  const spentToday = async () =>
    Number(
      (
        await db.query<{ spent: string | number }>(
          "SELECT spent FROM generation_budgets WHERE scope_id='u'"
        )
      ).rows[0]?.spent ?? 0
    );

  const lastLog = async () =>
    (
      await db.query<{ stage: string; service: string; action: string; category: string | null; request_id: string | null; disposition: string | null }>(
        "SELECT stage,service,action,category,request_id,disposition FROM moderation_logs ORDER BY created_at DESC, id DESC LIMIT 1"
      )
    ).rows[0];

  it("a Waffo block never reaches the provider and releases the hold", async () => {
    const { job } = await enqueue("waffo-block");
    const calls: string[] = [];
    const processed = await runWorkerOnce(
      db,
      {
        provider: neverCalledProvider(calls),
        storage: new MemoryStorage(),
        generationMode: "live",
        moderation: moderationWith({ action: "block", matchedCategories: ["nsfw"], requestId: "REQ_B" }),
      },
      "worker-chain"
    );
    expect(processed).toBe(true);
    expect(calls).toEqual([]);
    expect(
      await db.query("SELECT status,error_code FROM generation_jobs WHERE id=$1", [job.id])
    ).toMatchObject({ rows: [{ status: "failed", error_code: "MODERATION_BLOCKED" }] });
    expect(await walletCounts()).toEqual({ credits: 50, reserved: 0 });
    expect(await spentToday()).toBe(0);
    expect(await lastLog()).toMatchObject({
      stage: "pre_generation",
      service: "waffo_prompt_sift",
      action: "block",
      category: "nsfw",
      disposition: "credits_released",
    });
  });

  it("an unresolved review hold ends the job and releases the hold", async () => {
    const { job } = await enqueue("waffo-review");
    const calls: string[] = [];
    await runWorkerOnce(
      db,
      {
        provider: neverCalledProvider(calls),
        storage: new MemoryStorage(),
        generationMode: "live",
        moderation: new PromptModerationService({
          merchantId: "MER_test",
          privateKey: PRIVATE_KEY_PEM,
          fetcher: async () => waffoVerdict({ action: "review", requestId: "REQ_R" }),
          reviewMaxWaitMs: 10,
          reviewRetryDelayMs: 5,
          sleep: instantSleep,
        }),
      },
      "worker-chain"
    );
    expect(calls).toEqual([]);
    expect(
      await db.query("SELECT status,error_code FROM generation_jobs WHERE id=$1", [job.id])
    ).toMatchObject({ rows: [{ status: "failed", error_code: "MODERATION_PENDING" }] });
    expect(await walletCounts()).toEqual({ credits: 50, reserved: 0 });
    expect(await lastLog()).toMatchObject({ action: "review", request_id: "REQ_R", disposition: "credits_released" });
  });

  it("the local blocklist blocks what Waffo allowed, without a provider call", async () => {
    const { job } = await enqueue("blocklist-hit", "a POKEMON PIKACHU wallpaper");
    const calls: string[] = [];
    await runWorkerOnce(
      db,
      {
        provider: neverCalledProvider(calls),
        storage: new MemoryStorage(),
        generationMode: "live",
        moderation: moderationWith({ action: "allow", requestId: "REQ_OK" }),
      },
      "worker-chain"
    );
    expect(calls).toEqual([]);
    expect(
      await db.query("SELECT status,error_code FROM generation_jobs WHERE id=$1", [job.id])
    ).toMatchObject({ rows: [{ status: "failed", error_code: "MODERATION_BLOCKED" }] });
    expect(await walletCounts()).toEqual({ credits: 50, reserved: 0 });
    expect(await lastLog()).toMatchObject({
      service: "local_blocklist",
      action: "block",
      category: "ip",
    });
  });

  it("live without configured prompt screening fails closed", async () => {
    const { job } = await enqueue("live-unscreened");
    const calls: string[] = [];
    await runWorkerOnce(
      db,
      {
        provider: neverCalledProvider(calls),
        storage: new MemoryStorage(),
        generationMode: "live",
      },
      "worker-chain"
    );
    expect(calls).toEqual([]);
    expect(
      await db.query("SELECT status,error_code FROM generation_jobs WHERE id=$1", [job.id])
    ).toMatchObject({ rows: [{ status: "failed", error_code: "MODERATION_UNAVAILABLE" }] });
  });

  it("rejected OUTPUT is never stored, releases credits, and retains the real cost", async () => {
    const { job } = await enqueue("output-block");
    const provider = new MockJobProvider();
    const generateSpy = { calls: 0 };
    const providerSpy: JobProvider = {
      async generate(input, signal) {
        generateSpy.calls += 1;
        return provider.generate(input, signal);
      },
    };
    const processed = await runWorkerOnce(
      db,
      {
        provider: providerSpy,
        storage: new MemoryStorage(),
        generationMode: "live",
        moderation: moderationWith({ action: "allow", requestId: "REQ_OK" }),
        outputModeration: outputWith(true, { sexual: true }),
      },
      "worker-chain"
    );
    expect(processed).toBe(true);
    expect(generateSpy.calls).toBe(1);
    expect(
      await db.query("SELECT status,error_code FROM generation_jobs WHERE id=$1", [job.id])
    ).toMatchObject({
      rows: [{ status: "failed", error_code: "OUTPUT_MODERATION_BLOCKED" }],
    });
    // Scenario B: credits refunded to the user, real provider cost retained.
    expect(await walletCounts()).toEqual({ credits: 50, reserved: 0 });
    expect(await spentToday()).toBe(100);
    const storedAssets = await db.query(
      "SELECT count(*)::int AS n FROM image_assets WHERE job_id=$1",
      [job.id]
    );
    expect(storedAssets.rows[0]?.n ?? 0).toBe(0);
    expect(await lastLog()).toMatchObject({
      stage: "post_generation",
      service: "output_moderation",
      action: "block",
      category: "sexual",
      disposition: "rejected_not_published",
    });
    // Re-running must not process or charge anything again.
    expect(
      await runWorkerOnce(
        db,
        {
          provider: providerSpy,
          storage: new MemoryStorage(),
          generationMode: "live",
          moderation: moderationWith({ action: "allow" }),
          outputModeration: outputWith(false),
        },
        "worker-chain"
      )
    ).toBe(false);
    expect(await spentToday()).toBe(100);
  });

  it("live output without configured output moderation is never published", async () => {
    const { job } = await enqueue("output-unscreened");
    await runWorkerOnce(
      db,
      {
        provider: new MockJobProvider(),
        storage: new MemoryStorage(),
        generationMode: "live",
        moderation: moderationWith({ action: "allow" }),
        // No outputModeration configured.
      },
      "worker-chain"
    );
    expect(
      await db.query("SELECT status,error_code FROM generation_jobs WHERE id=$1", [job.id])
    ).toMatchObject({
      rows: [{ status: "failed", error_code: "OUTPUT_MODERATION_UNAVAILABLE" }],
    });
    expect(await walletCounts()).toEqual({ credits: 50, reserved: 0 });
    expect(await spentToday()).toBe(100);
    const storedAssets = await db.query(
      "SELECT count(*)::int AS n FROM image_assets WHERE job_id=$1",
      [job.id]
    );
    expect(storedAssets.rows[0]?.n ?? 0).toBe(0);
  });

  it("an approved flow screens, stores and charges exactly once", async () => {
    const { job } = await enqueue("chain-ok");
    const storage = new MemoryStorage();
    const processed = await runWorkerOnce(
      db,
      {
        provider: new MockJobProvider(),
        storage,
        generationMode: "live",
        moderation: moderationWith({ action: "allow", requestId: "REQ_OK" }),
        outputModeration: outputWith(false),
      },
      "worker-chain"
    );
    expect(processed).toBe(true);
    expect(
      await db.query("SELECT status FROM generation_jobs WHERE id=$1", [job.id])
    ).toMatchObject({ rows: [{ status: "succeeded" }] });
    expect(await storage.get(job.id)).toMatchObject({ mime: "image/png" });
    expect(await walletCounts()).toEqual({ credits: 45, reserved: 0 });
    expect(await lastLog()).toMatchObject({
      stage: "post_generation",
      action: "allow",
      disposition: "published_to_user",
    });
  });

  it("mock generation skips both screening stages", async () => {
    const { job } = await enqueue("mock-skip");
    const storage = new MemoryStorage();
    const processed = await runWorkerOnce(
      db,
      { provider: new MockJobProvider(), storage, generationMode: "mock", mock: true },
      "worker-chain"
    );
    expect(processed).toBe(true);
    expect(
      await db.query("SELECT status FROM generation_jobs WHERE id=$1", [job.id])
    ).toMatchObject({ rows: [{ status: "succeeded" }] });
    expect(await walletCounts()).toEqual({ credits: 50, reserved: 0 });
    const logs = (
      await db.query("SELECT stage,service,action,disposition FROM moderation_logs WHERE job_id=$1 ORDER BY created_at", [job.id])
    ).rows;
    expect(logs).toEqual([
      { stage: "pre_generation", service: "waffo_prompt_sift", action: "skipped", disposition: "mock_mode" },
      { stage: "post_generation", service: "output_moderation", action: "skipped", disposition: "mock_mode" },
    ]);
  });
});

describe("gallery rescan (AIGC stage 3)", () => {
  let db: Database;
  beforeEach(async () => {
    db = await createMemoryDatabase();
    await migrate(db);
  });
  afterEach(async () => {
    await db.close();
  });

  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");

  it("scans the manifest and records one gallery_scan row per asset", async () => {
    let moderationCalls = 0;
    const moderation = new OutputModerationService({
      apiKey: "k",
      fetcher: async () => {
        moderationCalls += 1;
        // First asset allows, second blocks.
        return openaiVerdict(moderationCalls === 2, { violence: true });
      },
    });
    const fetcher = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith("/manifest.json")) {
        return jsonResponse([
          { id: "preset:a", type: "image", url: "https://cdn.example/a.png" },
          { id: "community:b", type: "image", url: "https://cdn.example/bad.png" },
        ]);
      }
      return new Response(new Uint8Array(png), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }) as typeof fetch;

    const result = await rescanPublishedGallery(db, {
      manifestUrl: "https://example.com/manifest.json",
      moderation,
      fetcher,
    });
    expect(result).toMatchObject({ scanned: 2, allow: 1, block: 1 });
    expect(result.flagged).toEqual(["community:b"]);
    const rows = (
      await db.query<{ asset_id: string; stage: string; action: string; disposition: string }>(
        "SELECT asset_id,stage,action,disposition FROM moderation_logs ORDER BY asset_id"
      )
    ).rows;
    expect(rows).toEqual([
      { asset_id: "community:b", stage: "gallery_scan", action: "block", disposition: "flagged_for_takedown" },
      { asset_id: "preset:a", stage: "gallery_scan", action: "allow", disposition: "published" },
    ]);
  });

  it("rejects non-https manifest entries", async () => {
    const moderation = new OutputModerationService({ apiKey: "k" });
    const fetcher = (async () =>
      jsonResponse([{ id: "x", type: "image", url: "http://insecure/a.png" }])) as typeof fetch;
    await expect(
      rescanPublishedGallery(db, { manifestUrl: "https://example.com/m.json", moderation, fetcher })
    ).rejects.toThrow(/https/);
  });
});

describe("video frame sampling coverage", () => {
  it("always includes the first and the last frame plus evenly spaced middles", () => {
    expect(frameOffsets(5, 5).map((n) => Math.round(n * 100) / 100)).toEqual([
      0, 1.25, 2.5, 3.75, 4.9,
    ]);
  });

  it("samples the middle when only one frame is requested and clamps short clips", () => {
    expect(frameOffsets(4, 1)).toEqual([2]);
    const short = frameOffsets(0.05, 5);
    expect(short[0]).toBe(0);
    expect(short.every((offset) => offset >= 0 && offset <= 0.05)).toBe(true);
  });
});

describe("reference-image input screening (LIVE job creation)", () => {
  let db: Database;
  let cleanup: (() => Promise<void>) | null = null;
  beforeEach(async () => {
    db = await createMemoryDatabase();
    await migrate(db);
  });
  afterEach(async () => {
    await cleanup?.();
    await db.close();
  });

  const WEB = {
    "x-wallhaze-client": "web",
    "content-type": "application/json",
    origin: TEST_ORIGIN,
  };

  async function signUp(app: Awaited<ReturnType<typeof buildApp>>["app"]) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      headers: WEB,
      payload: { email: `ref-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, password: "example-password-long" },
    });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    return { cookie };
  }

  async function walletOf(userId: string) {
    const wallet = await getWallet(db, userId);
    return { credits: wallet.credits, reserved: wallet.reserved };
  }

  const outputWith = (flagged: boolean) =>
    new OutputModerationService({
      apiKey: "test-key",
      fetcher: async () => openaiVerdict(flagged, { sexual: true }),
    });

  const liveEnv = {
    CORS_ALLOWED_ORIGINS: TEST_ORIGIN,
    FAL_KEY: "test-key",
    FAL_LIVE_ENABLED: "1",
  };

  it("a flagged reference image is refused before any job exists", async () => {
    const { app } = await buildApp({
      env: liveEnv,
      database: db,
      storage: new MemoryStorage(),
      outputModeration: outputWith(true),
    });
    cleanup = () => app.close();
    const { cookie } = await signUp(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "ref-blocked" },
      payload: { prompt: "a wallpaper", device: "phone", refImage: PNG_DATA_URI },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("CONTENT_FILTERED");
    expect(
      (await db.query("SELECT count(*)::int AS n FROM generation_jobs")).rows[0].n
    ).toBe(0);
    expect(await lastRefLog()).toMatchObject({ action: "block", disposition: "upload_refused" });
  });

  it("an allowed reference image creates the job normally", async () => {
    const { app } = await buildApp({
      env: liveEnv,
      database: db,
      storage: new MemoryStorage(),
      outputModeration: outputWith(false),
    });
    cleanup = () => app.close();
    const { cookie } = await signUp(app);
    const userId = (await db.query<{ id: string }>("SELECT id FROM users LIMIT 1")).rows[0].id;
    await db.transaction((tx) => credit(tx, userId, 50, "seed", "test"));
    const res = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "ref-allow" },
      payload: { prompt: "a wallpaper", device: "phone", refImage: PNG_DATA_URI },
    });
    expect(res.statusCode).toBe(202);
    expect(await lastRefLog()).toMatchObject({ action: "allow", disposition: "upload_accepted" });
  });

  it("live reference uploads fail closed when screening is not configured", async () => {
    const { app } = await buildApp({
      env: liveEnv,
      database: db,
      storage: new MemoryStorage(),
      // No outputModeration wired.
    });
    cleanup = () => app.close();
    const { cookie } = await signUp(app);
    const userId = (await db.query<{ id: string }>("SELECT id FROM users LIMIT 1")).rows[0].id;
    await db.transaction((tx) => credit(tx, userId, 50, "seed", "test"));
    const res = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "ref-unscreened" },
      payload: { prompt: "a wallpaper", device: "phone", refImage: PNG_DATA_URI },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("SERVICE_UNAVAILABLE");
    expect(
      (await db.query("SELECT count(*)::int AS n FROM generation_jobs")).rows[0].n
    ).toBe(0);
    expect(await walletOf(userId)).toEqual({ credits: 50, reserved: 0 });
    expect(await lastRefLog()).toMatchObject({ action: "unavailable", disposition: "upload_refused_screening_unconfigured" });
  });

  it("mock mode accepts reference images without any screening call", async () => {
    let calls = 0;
    const { app } = await buildApp({
      env: { CORS_ALLOWED_ORIGINS: TEST_ORIGIN, FAL_MOCK: "1" },
      database: db,
      storage: new MemoryStorage(),
      outputModeration: new OutputModerationService({
        apiKey: "test-key",
        fetcher: async () => {
          calls += 1;
          return openaiVerdict(true, { sexual: true });
        },
      }),
    });
    cleanup = () => app.close();
    const { cookie } = await signUp(app);
    const mockUserId = (
      await db.query<{ id: string }>("SELECT id FROM users LIMIT 1")
    ).rows[0].id;
    await db.transaction((tx) => credit(tx, mockUserId, 50, "seed", "test"));
    const res = await app.inject({
      method: "POST",
      url: "/v1/generations/jobs",
      headers: { ...WEB, cookie, "idempotency-key": "ref-mock" },
      payload: { prompt: "a wallpaper", device: "phone", refImage: PNG_DATA_URI },
    });
    expect(res.statusCode).toBe(202);
    expect(calls).toBe(0);
  });

  async function lastRefLog() {
    return (
      await db.query<{ action: string; disposition: string; asset_id: string }>(
        "SELECT action,disposition,asset_id FROM moderation_logs ORDER BY created_at DESC, id DESC LIMIT 1"
      )
    ).rows[0];
  }
});
