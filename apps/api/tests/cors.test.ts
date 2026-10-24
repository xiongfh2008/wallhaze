import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const TEST_ENV = {
  PORT: "4000",
  LOG_LEVEL: "fatal",
  CORS_ALLOWED_ORIGINS: "http://localhost:3100,https://wallhaze.com",
};

const ALLOWED = "http://localhost:3100";
const DISALLOWED = "https://evil.example";

describe("CORS origin whitelist", () => {
  it("echoes an exact allowed origin", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: ALLOWED },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    await app.close();
  });

  it("serves a second allowed origin independently", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://wallhaze.com" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://wallhaze.com"
    );
    await app.close();
  });

  it("never echoes a disallowed origin", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: DISALLOWED },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("adds no CORS headers for non-browser requests (no Origin)", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("answers allowed preflights with 204", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/generations",
      headers: {
        origin: ALLOWED,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-wallhaze-client",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    await app.close();
  });

  it("allows credentialed requests and the headers the web client sends", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/auth/login",
      headers: {
        origin: ALLOWED,
        "access-control-request-method": "POST",
        "access-control-request-headers":
          "content-type, x-wallhaze-client, idempotency-key",
      },
    });
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    const allowedHeaders = String(
      res.headers["access-control-allow-headers"] ?? ""
    ).toLowerCase();
    expect(allowedHeaders).toContain("x-wallhaze-client");
    expect(allowedHeaders).toContain("idempotency-key");
    await app.close();
  });

  it("rejects disallowed preflights with 403 and the error envelope", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/generations",
      headers: {
        origin: DISALLOWED,
        "access-control-request-method": "POST",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    await app.close();
  });
});
