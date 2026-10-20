import { FAL_ENDPOINT, FAL_EDIT_ENDPOINT } from "./fal.endpoints.js";

export {
  FAL_EDIT_ENDPOINT,
  FAL_ENDPOINT,
} from "./fal.endpoints.js";

/**
 * fal.ai provider boundary (T04-S2).
 *
 * The ONLY place in the backend allowed to talk to fal.ai — and it only
 * does so through the injected `fetchImpl`. FAL_KEY is passed in at
 * construction and never logged, never echoed in errors, never returned.
 *
 * Faithful port of the legacy upstream interaction:
 * - sync endpoints, `Authorization: Key <FAL_KEY>`,
 * - one hard 120s timeout merged with the client-disconnect signal via
 *   AbortSignal.any (no automatic retry — a retry could double-bill),
 * - defensive JSON parsing (gateways can return non-JSON on 2xx),
 * - NSFW flag and empty-images handling mapped to typed failures.
 */

export interface FalImage {
  url?: string;
  content_type?: string;
  width?: number;
  height?: number;
}

export interface FalResult {
  images?: FalImage[];
  has_nsfw_concepts?: boolean[];
}

/** Why an upstream interaction did not produce an image. */
export type UpstreamFailure =
  /** Client disconnected — the local request was aborted. */
  | "client-aborted"
  /** The 120s merged timeout fired (or an AbortError arrived unasked). */
  | "timeout"
  /** fetch itself rejected (DNS, refused, TLS, network). */
  | "failed"
  /** Upstream answered with a non-2xx status. */
  | "status"
  /** 2xx but the body was not parseable JSON. */
  | "invalid-response"
  /** 2xx JSON but no usable image in it. */
  | "no-image"
  /** 2xx JSON but the safety checker flagged the result. */
  | "nsfw";

export class UpstreamError extends Error {
  readonly failure: UpstreamFailure;
  readonly upstreamStatus?: number;
  /** Provider detail — LOG-ONLY, never surfaced to clients. */
  readonly detail?: string;

  constructor(
    failure: UpstreamFailure,
    options: { upstreamStatus?: number; detail?: string } = {}
  ) {
    super(`upstream failure: ${failure}`);
    this.name = "UpstreamError";
    this.failure = failure;
    this.upstreamStatus = options.upstreamStatus;
    this.detail = options.detail;
  }
}

export interface FalGenerateCall {
  endpoint: string;
  payload: Record<string, unknown>;
  /** Merged client-disconnect + timeout signal. */
  signal: AbortSignal;
}

export interface FalProvider {
  /** Records every call for tests (mock) — empty for the real provider. */
  readonly calls: ReadonlyArray<{
    endpoint: string;
    payload: Record<string, unknown>;
  }>;
  generate(call: FalGenerateCall): Promise<{
    imageUrl: string;
    width: number | null;
    height: number | null;
    contentType: string | null;
  }>;
}

function extractFalErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === "object" && item !== null && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : String(item)
      )
      .join("; ");
  }
  return "";
}

/** Legacy upstream timeout — abort also interrupts the body read. */
export const FAL_TIMEOUT_MS = 120_000;

/** Real provider: fetches the configured fal.ai endpoint. */
export function createFalProvider(deps: {
  fetchImpl: typeof fetch;
  falKey: string;
}): FalProvider {
  return {
    calls: [],
    async generate({ endpoint, payload, signal: clientSignal }) {
      // Merge the client disconnect signal with the hard upstream timeout —
      // no automatic retry on either (a retry could double-bill).
      const mergedSignal = AbortSignal.any([
        clientSignal,
        AbortSignal.timeout(FAL_TIMEOUT_MS),
      ]);
      let response: Response;
      try {
        response = await deps.fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Key ${deps.falKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: mergedSignal,
        });
      } catch (error) {
        // Distinguish a client disconnect from the 120s timeout by checking
        // WHICH signal aborted. Aborting the local request does NOT cancel a
        // started fal.ai task or waive its cost.
        const isAbort =
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError");
        if (isAbort) {
          throw new UpstreamError(
            clientSignal.aborted ? "client-aborted" : "timeout"
          );
        }
        throw new UpstreamError("failed", {
          detail: error instanceof Error ? error.message : String(error),
        });
      }

      if (!response.ok) {
        const errorBody = (await response
          .json()
          .catch(() => null)) as { detail?: unknown } | null;
        const detail = errorBody
          ? extractFalErrorDetail(errorBody.detail)
          : "";
        throw new UpstreamError("status", {
          upstreamStatus: response.status,
          detail,
        });
      }

      // 2xx — parse the body defensively.
      let result: FalResult;
      try {
        result = (await response.json()) as FalResult;
      } catch {
        throw new UpstreamError("invalid-response");
      }

      if (result.has_nsfw_concepts?.[0] === true) {
        throw new UpstreamError("nsfw");
      }
      const image = result.images?.[0];
      if (!image?.url) {
        throw new UpstreamError("no-image");
      }
      return {
        imageUrl: image.url,
        width: image.width ?? null,
        height: image.height ?? null,
        contentType: image.content_type ?? null,
      };
    },
  };
}

/**
 * In-process mock provider — the ONLY provider used in tests. Never touches
 * the network, records every call, and produces deterministic outcomes
 * driven by a per-instance responder function.
 */
export interface MockRespond {
  (call: {
    endpoint: string;
    payload: Record<string, unknown>;
  }): MockOutcome;
}

export type MockOutcome =
  | {
      kind: "success";
      imageUrl?: string;
      width?: number | null;
      height?: number | null;
      contentType?: string | null;
    }
  | { kind: "nsfw" }
  | { kind: "no-image" }
  | { kind: "upstream-status"; status: number; detail?: unknown }
  | { kind: "invalid-json" }
  | { kind: "network-error" }
  /** Simulates an upstream AbortError while the client signal is NOT aborted. */
  | { kind: "timeout" };

export function createMockProvider(respond?: MockRespond): FalProvider {
  const calls: Array<{
    endpoint: string;
    payload: Record<string, unknown>;
  }> = [];
  const defaultRespond: MockRespond = () => ({
    kind: "success",
    imageUrl: "https://v3b.fal.media/mock/generated.png",
    width: 1080,
    height: 1920,
    contentType: "image/png",
  });
  return {
    get calls() {
      return calls;
    },
    async generate({ endpoint, payload, signal }) {
      calls.push({ endpoint, payload });
      const outcome = (respond ?? defaultRespond)({ endpoint, payload });
      switch (outcome.kind) {
        case "success":
          if (signal.aborted) {
            throw new UpstreamError("client-aborted");
          }
          return {
            imageUrl:
              outcome.imageUrl ?? "https://v3b.fal.media/mock/generated.png",
            width: outcome.width ?? null,
            height: outcome.height ?? null,
            contentType: outcome.contentType ?? null,
          };
        case "nsfw":
          throw new UpstreamError("nsfw");
        case "no-image":
          throw new UpstreamError("no-image");
        case "upstream-status":
          throw new UpstreamError("status", {
            upstreamStatus: outcome.status,
            // MockOutcome.detail is deliberately `unknown` (mocks may attach
            // anything); the real wire detail is a string.
            detail:
              typeof outcome.detail === "string" ? outcome.detail : undefined,
          });
        case "invalid-json":
          throw new UpstreamError("invalid-response");
        case "network-error":
          throw new UpstreamError("failed", {
            detail: "mock network failure",
          });
        case "timeout":
          // Upstream died of a timeout while the client is still connected —
          // mapped by the service to the legacy upstream:timeout outcome.
          // (The REAL provider derives this from a raw AbortError; that
          // mapping is covered by the provider unit tests.)
          throw new UpstreamError("timeout");
      }
    },
  };
}
