import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const TEST_ENV = {
  PORT: "4000",
  LOG_LEVEL: "fatal",
  CORS_ALLOWED_ORIGINS: "http://localhost:3100",
};

describe("unified error handling", () => {
  it("maps unknown routes to a 404 NOT_FOUND envelope", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    expect(res.json().error.message).toContain("/nope");
    await app.close();
  });

  it("maps malformed JSON bodies to a 400 VALIDATION_ERROR envelope", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    const res = await app.inject({
      method: "POST",
      url: "/v1/generations",
      headers: { "content-type": "application/json" },
      payload: "{not-json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    await app.close();
  });

  it("maps oversized bodies to a 413 PAYLOAD_TOO_LARGE envelope", async () => {
    const { app } = await buildApp({ env: TEST_ENV });
    // The generation route allows 10 MiB — send slightly more.
    const bigRefImage = `data:image/png;base64,${"A".repeat(11 * 1024 * 1024)}`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/generations",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        prompt: "test",
        styleId: "abstract",
        device: "phone",
        aspectRatio: "9:16",
        refImage: bigRefImage,
      }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("PAYLOAD_TOO_LARGE");
    await app.close();
  });
});
