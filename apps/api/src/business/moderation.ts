import { createHash, createPrivateKey, sign as cryptoSign } from "node:crypto";
import type { Database } from "../db/database.js";

/**
 * Waffo Prompt Sift client (pre-generation prompt screening).
 *
 * Implements the official API (docs.waffo.ai/api-reference/endpoints/
 * content-safety/scan-prompt):
 *  - POST {endpoint}/v1/actions/verification/scan-prompt
 *  - RSA-SHA256 request signing with the merchant's private key:
 *      bodyHash  = base64(SHA256(raw body bytes))
 *      canonical = METHOD \n PATH \n TIMESTAMP \n bodyHash   (newline-joined)
 *      signature = base64(RSA-SHA256-sign(canonical))
 *    sent as X-Merchant-Id / X-Timestamp (unix seconds) / X-Signature.
 *    The key is the SAME merchant key used by the payment integration
 *    ("uses existing payment API Key", official docs).
 *  - Request body: { prompt: string (1..10000 chars), locale?, semantic? }
 *  - Response 200: { data: { action: "allow"|"review"|"block",
 *      reasonCode, matchedCategories[], requestId, semanticStatus } }
 *  - "review" = hold and re-scan the same request (official policy; a
 *    decision usually resolves within ~1 hour). There is NO result-query,
 *    callback or webhook endpoint in the Waffo API — the only documented
 *    way to resolve a review is re-scanning. scanWithHold() implements the
 *    bounded version of that loop; if the budget expires the caller must
 *    fail closed. The requestId is preserved for human appeal with Waffo.
 *  - Errors: 4xx never retried; 429 honors Retry-After (bounded);
 *    5xx retried with exponential backoff starting 5s, max 3 attempts.
 *
 * Safety contract:
 *  - scan() NEVER throws and never returns raw provider text: transport,
 *    HTTP and unknown-shape failures resolve to action "unavailable" so
 *    callers fail closed instead of generating unscreened.
 *  - When credentials are absent the service reports enabled=false and
 *    scan() resolves to "unavailable" — callers decide whether that is
 *    acceptable (mock generation) or must fail closed (live generation).
 */

export type ModerationAction = "allow" | "review" | "block" | "unavailable";

export interface ModerationScanResult {
  action: ModerationAction;
  /** Official reasonCode when the provider returned one. */
  reasonCode: string | null;
  /** Restricted categories matched by the provider (empty unless block). */
  categories: string[];
  /** Provider request id — required for appeals with Waffo. */
  requestId: string | null;
  /** HTTP status of the last attempt (null on transport failure). */
  status: number | null;
  /** How long the review-hold loop waited, in ms (0 outside a hold). */
  heldMs: number;
}

export interface PromptModerationOptions {
  merchantId: string | null;
  /** PEM private key (raw or \n-escaped) used for RSA-SHA256 signing. */
  privateKey: string | null;
  endpoint?: string;
  /** One of "ja" | "en" | "zh" (official locale enum). Default "en". */
  locale?: string;
  /** One of "off" | "shadow" | "enforce". Default "enforce". */
  semantic?: string;
  /** Total budget for the review hold-and-retry loop. Default 120s. */
  reviewMaxWaitMs?: number;
  /** Delay between review re-scans. Default 30s. */
  reviewRetryDelayMs?: number;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetcher?: typeof fetch;
  /** Injectable clock for tests (ms). */
  sleep?: (ms: number) => Promise<void>;
}

export const WAFFO_BASE_URL = "https://api.waffo.ai";
export const SCAN_PROMPT_PATH = "/v1/actions/verification/scan-prompt";
/** Hard API limit; longer prompts cannot be screened and must fail closed. */
export const MAX_PROMPT_CHARS = 10_000;

function normalizePem(value: string): string {
  // Already PEM: unescape single-line \n if present.
  if (value.includes("-----BEGIN")) {
    return value.includes("\n") ? value : value.replace(/\\n/g, "\n");
  }
  // Raw base64 (the Waffo payment env format): wrap in PKCS8 PEM headers.
  const clean = value.replace(/\s/g, "");
  return `-----BEGIN PRIVATE KEY-----\n${clean}\n-----END PRIVATE KEY-----`;
}

export class PromptModerationService {
  readonly enabled: boolean;

  private readonly keyObject: ReturnType<typeof createPrivateKey> | null;

  constructor(private readonly options: PromptModerationOptions) {
    this.enabled = Boolean(options.merchantId && options.privateKey);
    let keyObject: ReturnType<typeof createPrivateKey> | null = null;
    if (this.enabled) {
      try {
        keyObject = createPrivateKey(normalizePem(options.privateKey!));
      } catch {
        // An unparsable key must not silently disable screening: keep
        // enabled=true so callers fail closed instead of trusting scans.
        keyObject = null;
      }
    }
    this.keyObject = keyObject;
    if (this.enabled && !keyObject) {
      throw new Error(
        "WAFFO_PRIVATE_KEY is set but cannot be parsed as a private key"
      );
    }
  }

  /** Official canonical request signing (RSA-SHA256, base64). */
  private signRequest(
    method: string,
    path: string,
    timestampSeconds: string,
    rawBody: string
  ): string {
    const bodyHash = createHash("sha256")
      .update(rawBody, "utf8")
      .digest("base64");
    const canonical = [method, path, timestampSeconds, bodyHash].join("\n");
    return cryptoSign("sha256", Buffer.from(canonical, "utf8"), this.keyObject!).toString("base64");
  }

  private async scanOnce(
    prompt: string
  ): Promise<{ result: ModerationScanResult; retryAfterMs: number }> {
    const endpoint = this.options.endpoint ?? WAFFO_BASE_URL;
    const path = SCAN_PROMPT_PATH;
    const body = JSON.stringify({
      prompt,
      locale: this.options.locale ?? "en",
      semantic: this.options.semantic ?? "enforce",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const unavailable = (
      status: number | null,
      reasonCode: string | null = null
    ): { result: ModerationScanResult; retryAfterMs: number } => ({
      result: {
        action: "unavailable",
        reasonCode,
        categories: [],
        requestId: null,
        status,
        heldMs: 0,
      },
      retryAfterMs: 0,
    });
    try {
      const response = await (this.options.fetcher ?? fetch)(`${endpoint}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Merchant-Id": this.options.merchantId!,
          "X-Timestamp": timestamp,
          "X-Signature": this.signRequest("POST", path, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
      if (!response.ok) {
        // Official policy: 429 honors Retry-After; 5xx retries with
        // exponential backoff; 4xx is never retried.
        const retryAfterMs =
          response.status === 429
            ? Math.min(
                Number(response.headers.get("retry-after") ?? "5") * 1000 ||
                  5000,
                10_000
              )
            : response.status >= 500
              ? 5000
              : 0;
        return {
          result: {
            action: "unavailable",
            reasonCode: null,
            categories: [],
            requestId: null,
            status: response.status,
            heldMs: 0,
          },
          retryAfterMs,
        };
      }
      const bodyJson = (await response.json().catch(() => null)) as {
        data?: {
          action?: unknown;
          reasonCode?: unknown;
          matchedCategories?: unknown;
          requestId?: unknown;
        };
      } | null;
      const payload = bodyJson?.data;
      if (!payload || typeof payload !== "object") {
        // Unknown shape — fail closed rather than guessing "allow".
        return unavailable(response.status);
      }
      const action = String(payload.action ?? "").toLowerCase();
      const base = {
        reasonCode:
          typeof payload.reasonCode === "string" ? payload.reasonCode : null,
        categories: Array.isArray(payload.matchedCategories)
          ? payload.matchedCategories.filter(
              (item): item is string => typeof item === "string"
            )
          : [],
        requestId:
          typeof payload.requestId === "string" ? payload.requestId : null,
        status: response.status,
        heldMs: 0,
      };
      if (action === "allow") return { result: { action: "allow", ...base }, retryAfterMs: 0 };
      if (action === "block") return { result: { action: "block", ...base }, retryAfterMs: 0 };
      if (action === "review") return { result: { action: "review", ...base }, retryAfterMs: 0 };
      return unavailable(response.status, base.reasonCode);
    } catch {
      // Timeout / DNS / reset — fail closed. No raw error text escapes.
      return unavailable(null);
    }
  }

  /** One screening request. Never throws; retries per the official policy. */
  async scan(prompt: string): Promise<ModerationScanResult> {
    if (!this.enabled || !this.keyObject) {
      return {
        action: "unavailable",
        reasonCode: null,
        categories: [],
        requestId: null,
        status: null,
        heldMs: 0,
      };
    }
    if (prompt.length === 0 || prompt.length > MAX_PROMPT_CHARS) {
      // An empty or unscreenable prompt must never reach a paid provider.
      return {
        action: "unavailable",
        reasonCode: "prompt_out_of_range",
        categories: [],
        requestId: null,
        status: null,
        heldMs: 0,
      };
    }
    // Official retry policy: 5xx with exponential backoff (start 5s, max 3
    // attempts); 429 honors Retry-After; 4xx never retried.
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let attempt = await this.scanOnce(prompt);
    for (let retry = 0; retry < 2 && attempt.result.action === "unavailable" && attempt.retryAfterMs > 0; retry += 1) {
      const backoff = attempt.result.status !== null && attempt.result.status >= 500
        ? attempt.retryAfterMs * (retry + 1)
        : attempt.retryAfterMs;
      await sleep(backoff);
      attempt = await this.scanOnce(prompt);
    }
    return attempt.result;
  }

  /**
   * Official "hold and retry" handling for verdict=review: re-scan the same
   * request until the verdict resolves or the hold budget expires. Waffo
   * provides no query/callback endpoint, so this bounded loop is the only
   * documented resolution path; an unresolved review must fail closed.
   */
  async scanWithHold(prompt: string): Promise<ModerationScanResult> {
    const startedAt = Date.now();
    const maxWaitMs = this.options.reviewMaxWaitMs ?? 120_000;
    const retryDelayMs = this.options.reviewRetryDelayMs ?? 30_000;
    let result = await this.scan(prompt);
    while (result.action === "review" && Date.now() - startedAt < maxWaitMs) {
      const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      await sleep(retryDelayMs);
      const next = await this.scan(prompt);
      result = { ...next, heldMs: Date.now() - startedAt };
    }
    if (result.action === "review") {
      return { ...result, heldMs: Date.now() - startedAt };
    }
    return result;
  }
}

export interface ModerationLogInput {
  /** Generation job id (null for gallery scans). */
  jobId: string | null;
  /** Owning user id when the screened content belongs to a user. */
  userId?: string | null;
  /** Gallery asset identifier when screening published content. */
  assetId?: string | null;
  stage: "pre_generation" | "post_generation" | "gallery_scan";
  service: "waffo_prompt_sift" | "local_blocklist" | "output_moderation";
  action: ModerationAction | "skipped";
  reasonCode?: string | null;
  category: string | null;
  requestId: string | null;
  /** What happened to the content after the verdict (e.g. "credits_released", "published", "flagged_for_takedown"). */
  disposition?: string | null;
}

/**
 * Audit trail for moderation decisions. Writes are best-effort: a logging
 * failure must not block the surrounding job flow, but is surfaced via the
 * returned flag so the caller can log it. Rows never contain prompts,
 * reference images, credentials or API keys.
 */
export async function recordModerationLog(
  db: Database,
  input: ModerationLogInput
): Promise<boolean> {
  try {
    await db.query(
      `INSERT INTO moderation_logs(
         job_id,user_id,asset_id,stage,service,action,
         reason_code,category,request_id,disposition
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.jobId,
        input.userId ?? null,
        input.assetId ?? null,
        input.stage,
        input.service,
        input.action,
        input.reasonCode ?? null,
        input.category,
        input.requestId,
        input.disposition ?? null,
      ]
    );
    return true;
  } catch {
    return false;
  }
}
