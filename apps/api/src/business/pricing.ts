/**
 * Server-side pricing (R04/R05). The ONLY source of generation prices —
 * the frontend must display what this module (via the API) returns, never
 * a client-computed number.
 */

/** Credits charged per successful generation attempt (reserved up front). */
export const GENERATION_PRICE_CREDITS = 10;

/**
 * Upper bound of provider cost per attempt, in micro units (1e-6 USD).
 *
 * Derived from the verified fal.ai klein-4b price ($0.005/MP) and the API's
 * own size caps: the largest accepted image is 2048x2048 = 4.19MP, i.e.
 * ~$0.021 real cost, so $0.05 keeps ~2.4x headroom. The previous $4.00
 * placeholder was 200x the real worst case and, under the $10/day user
 * budget, would have capped real users at TWO image generations per day.
 * This bound feeds budget accounting only (generation_budgets), never
 * Credits pricing.
 */
export const GENERATION_COST_BOUND_MICROS = 50_000;

export interface GenerationPricing {
  creditsPerGeneration: number;
  costBoundMicros: number;
}

export function generationPricing(): GenerationPricing {
  return {
    creditsPerGeneration: GENERATION_PRICE_CREDITS,
    costBoundMicros: GENERATION_COST_BOUND_MICROS,
  };
}
