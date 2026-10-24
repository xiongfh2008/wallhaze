/**
 * Credits availability gate.
 *
 * The gate is the single structural control point for paid submission: the
 * Studio feeds it REAL runtime facts (session, server price, wallet balance)
 * and only sends a job when all three are available. There is deliberately
 * no static "services enabled" switch here — the previous FE04-A constant
 * (`CREDITS_SERVICES`, always false) was removed after the backend landed,
 * because a stale flag could silently block every generation.
 *
 * The backend remains the authority: even a forged `canSubmit` cannot create
 * a job without a session, sufficient Credits and a server-computed price.
 */

/** Why a generation attempt cannot be submitted right now. */
export type CreditsBlockReason =
  | "auth-unavailable"
  | "pricing-unavailable"
  | "wallet-unavailable";

/** Availability of the three backend services real submission depends on. */
export interface CreditsGateInput {
  /** Auth (FE05) — a real, verified user session exists. */
  authAvailable: boolean;
  /** Pricing (backend contract) — the server returned a real price. */
  pricingAvailable: boolean;
  /** Credits wallet (FE06) — a real balance is known and sufficient. */
  walletAvailable: boolean;
}

export interface CreditsGate {
  canSubmit: boolean;
  /** First missing dependency when submission is blocked; null otherwise. */
  reason: CreditsBlockReason | null;
}

/**
 * Decides whether a paid generation may be submitted. Checked in dependency
 * order — auth first (who pays?), then pricing (how much?), then wallet
 * (can they pay?).
 */
export function resolveCreditsGate(input: CreditsGateInput): CreditsGate {
  if (!input.authAvailable) {
    return { canSubmit: false, reason: "auth-unavailable" };
  }
  if (!input.pricingAvailable) {
    return { canSubmit: false, reason: "pricing-unavailable" };
  }
  if (!input.walletAvailable) {
    return { canSubmit: false, reason: "wallet-unavailable" };
  }
  return { canSubmit: true, reason: null };
}
