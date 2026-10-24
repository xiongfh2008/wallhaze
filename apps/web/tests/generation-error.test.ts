import { describe, expect, it } from "vitest";
import { generationErrorKey } from "@/lib/studio/generation-error";

/**
 * Job failures must stay distinguishable in the UI: a storage failure is not
 * a provider outage, and an upstream timeout is not a generic error.
 */
describe("generation error mapping", () => {
  it("maps worker error codes to specific copy", () => {
    expect(generationErrorKey("STORAGE_FAILED", "http")).toBe(
      "errorStorageFailed"
    );
    expect(generationErrorKey("UPSTREAM_TIMEOUT", "http")).toBe("errorTimeout");
    expect(generationErrorKey("UPSTREAM_ERROR", "http")).toBe("errorUpstream");
  });

  it("maps API codes to auth/credits/rate copy", () => {
    expect(generationErrorKey("RATE_LIMITED", "http")).toBe("errorRateLimited");
    expect(generationErrorKey("CONFLICT", "http")).toBe(
      "errorInsufficientCredits"
    );
    expect(generationErrorKey("SERVICE_UNAVAILABLE", "http")).toBe(
      "errorServiceUnavailable"
    );
    expect(generationErrorKey("UPSTREAM_UNCERTAIN", "http")).toBe(
      "errorUncertain"
    );
    expect(generationErrorKey(null, "http")).toBe("generateFailed");
  });

  it("maps a client-side polling timeout", () => {
    expect(generationErrorKey(null, "timeout")).toBe("errorTimeout");
    expect(generationErrorKey("RATE_LIMITED", "timeout")).toBe(
      "errorRateLimited"
    );
  });

  it("never treats an unknown job code as success", () => {
    expect(generationErrorKey("SOMETHING_NEW", "http")).toBe("generateFailed");
    expect(generationErrorKey(undefined, "network")).toBe("generateFailed");
  });
});
