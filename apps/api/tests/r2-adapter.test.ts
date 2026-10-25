import { describe, expect, it } from "vitest";
import {
  canonicalQueryString,
  encodeS3Path,
  signS3Request,
} from "../src/business/r2-sign.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  R2Storage,
  describeR2NetworkError,
  resolveStorageFromEnv,
} from "../src/business/r2-storage.js";
import { MemoryStorage } from "../src/business/storage.js";

const PNG = readFileSync(
  path.resolve("assets", "live-mock", "9x16-3s.png")
);

describe("SigV4 signing (offline)", () => {
  it("encodes path segments while preserving separators", () => {
    expect(encodeS3Path("/bucket/deployment-test/a b+c.png")).toBe(
      "/bucket/deployment-test/a%20b%2Bc.png"
    );
    expect(encodeS3Path("/b/plain-key_1.2-3.jpg")).toBe(
      "/b/plain-key_1.2-3.jpg"
    );
  });

  it("sorts and encodes query parameters canonically", () => {
    expect(canonicalQueryString({ b: "2", a: "x y" })).toBe(
      "a=x%20y&b=2"
    );
    expect(canonicalQueryString()).toBe("");
  });

  it("is deterministic for identical inputs", () => {
    const base = {
      method: "GET" as const,
      url: "https://acct.r2.cloudflarestorage.com/bucket/k.jpg",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secret-example",
      amzDate: new Date("2026-10-24T00:00:00Z"),
    };
    const a = signS3Request(base);
    const b = signS3Request(base);
    expect(a.headers.Authorization).toBe(b.headers.Authorization);
    expect(a.headers.Authorization).toContain(
      "Credential=AKIAEXAMPLE/20261024/auto/s3/aws4_request"
    );
    expect(a.headers.Authorization).toContain(
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date"
    );
    expect(a.headers["x-amz-date"]).toBe("20261024T000000Z");
  });

  it("changes the signature with body, key and date", () => {
    const base = {
      method: "PUT" as const,
      url: "https://acct.r2.cloudflarestorage.com/b/k",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secret-example",
      amzDate: new Date("2026-10-24T00:00:00Z"),
    };
    const ref = signS3Request(base).headers.Authorization;
    expect(signS3Request({ ...base, body: Buffer.from("x") }).headers.Authorization).not.toBe(ref);
    expect(
      signS3Request({ ...base, secretAccessKey: "other" }).headers.Authorization
    ).not.toBe(ref);
    expect(
      signS3Request({ ...base, amzDate: new Date("2026-10-25T00:00:00Z") })
        .headers.Authorization
    ).not.toBe(ref);
  });
});

describe("R2Storage factory (offline)", () => {
  it("defaults to the fallback driver when unset or local", () => {
    const fallback = () => new MemoryStorage();
    expect(resolveStorageFromEnv({}, fallback)).toBeInstanceOf(MemoryStorage);
    expect(
      resolveStorageFromEnv({ STORAGE_DRIVER: "local" }, fallback)
    ).toBeInstanceOf(MemoryStorage);
  });

  it("refuses STORAGE_DRIVER=r2 with incomplete credentials (fail-closed)", () => {
    expect(() =>
      resolveStorageFromEnv({ STORAGE_DRIVER: "r2" }, () => new MemoryStorage())
    ).toThrow(/R2_ENDPOINT/);
    expect(() =>
      resolveStorageFromEnv(
        { STORAGE_DRIVER: "r2", R2_ENDPOINT: "https://a.r2.cloudflarestorage.com" },
        () => new MemoryStorage()
      )
    ).toThrow(/R2_ACCESS_KEY_ID/);
  });

  it("get(): retries a transient network failure, then succeeds", async () => {
    let calls = 0;
    const fetcher = (async (_url: unknown, _init?: unknown) => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed"); // undici network error
      return new Response(new Uint8Array(PNG), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;
    const storage = new R2Storage({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      accessKeyId: "a",
      secretAccessKey: "s",
      bucket: "wallhaze-staging-private",
      fetcher,
    });
    const stored = await storage.get("deployment-test/retry.png");
    expect(stored.bytes.equals(PNG)).toBe(true);
    expect(stored.mime).toBe("image/png");
    expect(calls).toBe(2);
  });

  it("get(): retries R2 5xx once, then succeeds", async () => {
    let calls = 0;
    const fetcher = (async (_url: unknown, _init?: unknown) => {
      calls += 1;
      if (calls === 1) return new Response("busy", { status: 503 });
      return new Response(new Uint8Array(PNG), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;
    const storage = new R2Storage({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      accessKeyId: "a",
      secretAccessKey: "s",
      bucket: "wallhaze-staging-private",
      fetcher,
    });
    await expect(storage.get("deployment-test/5xx.png")).resolves.toMatchObject({
      mime: "image/png",
    });
    expect(calls).toBe(2);
  });

  it("get(): does NOT retry a 404 (ASSET_MISSING, single call)", async () => {
    let calls = 0;
    const fetcher = (async (_url: unknown, _init?: unknown) => {
      calls += 1;
      return new Response("gone", { status: 404 });
    }) as unknown as typeof fetch;
    const storage = new R2Storage({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      accessKeyId: "a",
      secretAccessKey: "s",
      bucket: "wallhaze-staging-private",
      fetcher,
    });
    await expect(storage.get("deployment-test/missing.png")).rejects.toThrow(
      /ASSET_MISSING/
    );
    expect(calls).toBe(1);
  });

  it("get(): exhausts retries on persistent network errors with a redacted cause", async () => {
    let calls = 0;
    const fetcher = (async (_url: unknown, _init?: unknown) => {
      calls += 1;
      const failure = new TypeError("fetch failed");
      Object.assign(failure, {
        cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
      });
      throw failure;
    }) as unknown as typeof fetch;
    const storage = new R2Storage({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      accessKeyId: "a",
      secretAccessKey: "s",
      bucket: "wallhaze-staging-private",
      fetcher,
    });
    await expect(storage.get("deployment-test/dead.png")).rejects.toThrow(
      /R2 get failed after 3 attempts: CONN_RESET/
    );
    expect(calls).toBe(3);
  });

  it("put(): single-shot on network errors (no auto-retry of writes)", async () => {
    let calls = 0;
    const fetcher = (async (_url: unknown, _init?: unknown) => {
      calls += 1;
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const storage = new R2Storage({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      accessKeyId: "a",
      secretAccessKey: "s",
      bucket: "wallhaze-staging-private",
      fetcher,
    });
    await expect(
      storage.put("deployment-test/write.png", PNG, "image/png")
    ).rejects.toThrow(/R2 put failed/);
    expect(calls).toBe(1);
  });

  it("describeR2NetworkError classifies cause codes (redacted)", () => {
    const withCode = (code: string) =>
      new TypeError("fetch failed", {
        cause: Object.assign(new Error("x"), { code }),
      });
    expect(describeR2NetworkError(withCode("ECONNRESET"))).toBe("CONN_RESET(ECONNRESET)");
    expect(describeR2NetworkError(withCode("ETIMEDOUT"))).toBe("TIMEOUT(ETIMEDOUT)");
    expect(describeR2NetworkError(withCode("ENOTFOUND"))).toBe("DNS(ENOTFOUND)");
    expect(describeR2NetworkError(new Error("plain"))).toBe("NETWORK(unknown)");
  });

  it("validates the endpoint shape and constructs with a full set", () => {
    expect(
      () =>
        new R2Storage({
          endpoint: "https://evil.example.com",
          accessKeyId: "a",
          secretAccessKey: "s",
          bucket: "b",
        })
    ).toThrow(/R2_ENDPOINT/);
    const storage = new R2Storage({
      endpoint: "https://acct.r2.cloudflarestorage.com/",
      accessKeyId: "a",
      secretAccessKey: "s",
      bucket: "wallhaze-staging-private",
    });
    expect(storage).toBeInstanceOf(R2Storage);
  });
});
