/**
 * FUTURE business domains — TYPE PLACEHOLDERS ONLY (T04-S1).
 *
 * Nothing in this file is implemented, served, or persisted anywhere yet.
 * These types exist so contracts review can happen early; the real schemas
 * arrive with T04-B (database) and the commercialization phases. Do NOT
 * build UI or API routes against these shapes — they will change.
 */

/** Planned full identity model: see T04-A report, "users/auth_accounts". */
export interface UserAccountPlaceholder {
  /** Opaque user id — never an email. */
  id: string;
  status: "active" | "suspended" | "deleting" | "deleted";
  /** BCP-47 locale the user picked, e.g. "en". */
  locale: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Planned credits wallet. Balances are integers (never floats); available =
 * total minus reserved. See T04-A report, "credit_wallets/credit_ledger".
 */
export interface CreditWalletPlaceholder {
  userId: string;
  /** Total owned credits (purchased + adjusted). */
  total: number;
  /** Credits held by in-flight generation jobs. */
  reserved: number;
  updatedAt: string;
}

/** Planned payment order — provider-agnostic on purpose (no Stripe fields). */
export interface PaymentOrderPlaceholder {
  id: string;
  userId: string;
  /** Minor currency units (cents) + ISO 4217 code, e.g. 499 USD. */
  amountMinor: number;
  currency: string;
  creditsGranted: number;
  status:
    | "pending"
    | "paid"
    | "failed"
    | "cancelled"
    | "refunded"
    | "granted";
  createdAt: string;
}

/** Planned async AI job — state machine per T04-A report. */
export interface GenerationJobPlaceholder {
  id: string;
  userId: string;
  /** Idempotency key supplied by the client (planned). */
  idempotencyKey: string;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "timeout"
    | "cancelled";
  request: import("./generation.js").GenerationRequest;
  /** Credits reserved while the job is in flight. */
  creditsReserved: number;
  createdAt: string;
}
