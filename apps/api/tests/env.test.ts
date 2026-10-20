import { describe, expect, it } from "vitest";
import { corsOriginList, loadEnv } from "../src/config/env.js";

describe("loadEnv", () => {
  it("applies safe defaults to an empty environment", () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(4000);
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.CORS_ALLOWED_ORIGINS).toBe("");
    expect(env.BODY_LIMIT_BYTES).toBe(1_048_576);
  });

  it("coerces numeric strings", () => {
    const env = loadEnv({ PORT: "5000", BODY_LIMIT_BYTES: "2048" });
    expect(env.PORT).toBe(5000);
    expect(env.BODY_LIMIT_BYTES).toBe(2048);
  });

  it("rejects a non-numeric PORT instead of booting ambiguously", () => {
    expect(() => loadEnv({ PORT: "not-a-number" })).toThrow(
      /Invalid environment configuration/
    );
  });

  it("rejects an unknown log level", () => {
    expect(() => loadEnv({ LOG_LEVEL: "loud" })).toThrow(
      /Invalid environment configuration/
    );
  });
});

describe("corsOriginList", () => {
  it("splits, trims and drops empty entries", () => {
    const env = loadEnv({
      CORS_ALLOWED_ORIGINS: " http://a.test , http://b.test ,, ",
    });
    expect(corsOriginList(env)).toEqual(["http://a.test", "http://b.test"]);
  });

  it("yields an empty list when unset", () => {
    expect(corsOriginList(loadEnv({}))).toEqual([]);
  });
});
