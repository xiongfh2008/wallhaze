import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const TEST_ENV = {
  PORT: "4000",
  LOG_LEVEL: "fatal",
  CORS_ALLOWED_ORIGINS: "http://localhost:3100",
};

describe("GET /health", () => {
  it("answers 200 with the documented payload and a request id", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      status: "ok",
      service: "wallhaze-api",
    });
    expect(typeof body.version).toBe("string");
    expect(typeof body.timestamp).toBe("string");
    expect(res.headers["x-request-id"]).toBeTruthy();
    await app.close();
  });

  it("generates uuid-shaped request ids", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    await app.close();
  });
});
