import { buildApp } from "../src/app.js";
import type { FalProvider } from "../src/modules/generation/fal.provider.js";

/**
 * Shared test harness for the T04-S2 API suite.
 *
 * Isolation model (mirrors the legacy tests/setup.ts contract):
 * - Every app is driven in-process via app.inject() — nothing listens on
 *   3000 and no request ever leaves this process.
 * - The ONLY outbound boundary (provider fetch / image-proxy fetch) is
 *   injected per test; when a test forgets, the deny-all globalThis.fetch
 *   guard installed by tests/setup.ts catches the attempt and fails the run.
 * - FAL_KEY is always a fabricated dummy; .env.local is never read (env is
 *   injected per app).
 */

export const TEST_ORIGIN = "https://test.wallhaze.example";
export const DUMMY_KEY = "test-dummy-not-a-real-key";
export const PROMPT_MARKER = "SECRETPROMPTMARKER42";

/** Re-exported from production so the tests cannot drift from the real paths. */
export { FAL_ENDPOINT, FAL_EDIT_ENDPOINT } from "../src/modules/generation/fal.endpoints.js";

/** PNG magic bytes — the exact signature the validators/proxy check. */
export const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
export const PNG_DATA_URI = `data:image/png;base64,${Buffer.from(PNG_HEADER).toString("base64")}`;

/** Base env for buildTestApp: info level so outcome logs are captured. */
export const BASE_ENV: Record<string, string> = {
  PORT: "4000",
  LOG_LEVEL: "info",
  CORS_ALLOWED_ORIGINS: TEST_ORIGIN,
};

export interface PinoLine {
  [key: string]: unknown;
  outcome?: unknown;
  status?: unknown;
  durationMs?: unknown;
  reqId?: unknown;
  event?: unknown;
}

export interface LogCapture {
  /** Raw pino NDJSON lines. */
  lines: string[];
  /** Pass as buildApp loggerStream. */
  stream: { write(chunk: string): void };
  json(): PinoLine[];
  /** Lines carrying a structured outcome (route outcomes + framework rejects). */
  outcomeLines(): PinoLine[];
  /** Lines with event === "generate" (the legacy [generate] vocabulary). */
  generateLines(): PinoLine[];
  text(): string;
}

export function createLogCapture(): LogCapture {
  const lines: string[] = [];
  return {
    lines,
    stream: {
      write(chunk: string): void {
        lines.push(chunk);
      },
    },
    json(): PinoLine[] {
      return lines
        .map((line) => {
          try {
            return JSON.parse(line) as PinoLine;
          } catch {
            return null;
          }
        })
        .filter((v): v is PinoLine => v !== null);
    },
    outcomeLines(): PinoLine[] {
      return this.json().filter((l) => typeof l.outcome === "string");
    },
    generateLines(): PinoLine[] {
      return this.json().filter((l) => l.event === "generate");
    },
    text(): string {
      return lines.join("\n");
    },
  };
}

export interface TestAppOptions {
  /** Overrides merged over BASE_ENV (values may be undefined to unset). */
  env?: Record<string, string | undefined>;
  provider?: FalProvider;
  upstreamFetch?: typeof fetch;
}

export async function buildTestApp(options: TestAppOptions = {}): Promise<{
  app: Awaited<ReturnType<typeof buildApp>>["app"];
  capture: LogCapture;
}> {
  const capture = createLogCapture();
  const { app } = await buildApp({
    env: { ...BASE_ENV, ...options.env },
    provider: options.provider,
    upstreamFetch: options.upstreamFetch,
    loggerStream: capture.stream,
  });
  return { app, capture };
}

/** Minimal legal generation body: prompt + valid device, no optional fields. */
export function legalBody(): { prompt: string; device: "phone" } {
  return {
    prompt: `${PROMPT_MARKER} a calm neon city skyline wallpaper`,
    device: "phone",
  };
}

/**
 * Network-guard singleton. tests/setup.ts wires globalThis.fetch to a
 * deny-all implementation that records into `unexpectedCalls`; suites that
 * INTENTIONALLY prove the guard (legacy GEN-28) read and clear it.
 */
export const networkGuard = {
  unexpectedCalls: [] as string[],
  active: false,
  clear(): void {
    this.unexpectedCalls.length = 0;
  },
};

/** Inject helper for POST /v1/generations with the test origin. */
export async function postGeneration(
  app: Awaited<ReturnType<typeof buildApp>>["app"],
  body: unknown,
  options: {
    origin?: string | null;
    secFetchSite?: string;
    realIp?: string;
    contentType?: string | null;
    contentLength?: string;
    rawPayload?: string | Buffer;
  } = {}
): Promise<{ statusCode: number; body: string; json(): any; headers: Record<string, string> }> {
  const headers: Record<string, string> = {};
  if (options.contentType !== null) {
    headers["content-type"] = options.contentType ?? "application/json";
  }
  const origin = options.origin === null ? undefined : options.origin ?? TEST_ORIGIN;
  if (origin) headers.origin = origin;
  if (options.secFetchSite) headers["sec-fetch-site"] = options.secFetchSite;
  if (options.realIp) headers["x-real-ip"] = options.realIp;
  if (options.contentLength) headers["content-length"] = options.contentLength;
  const payload =
    options.rawPayload ??
    (body === undefined ? undefined : JSON.stringify(body));
  return (await app.inject({
    method: "POST",
    url: "/v1/generations",
    headers,
    ...(payload !== undefined ? { payload } : {}),
  })) as unknown as {
    statusCode: number;
    body: string;
    json(): any;
    headers: Record<string, string>;
  };
}
