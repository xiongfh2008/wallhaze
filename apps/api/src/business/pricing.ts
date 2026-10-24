/**
 * Server-side pricing (R04/R05). The ONLY source of generation prices —
 * the frontend must display what this module (via the API) returns, never
 * a client-computed number.
 */

/** Credits charged per successful generation attempt (reserved up front). */
export const GENERATION_PRICE_CREDITS = 10;

/** Upper bound of provider cost per attempt, in micro units (1e-6 USD). */
export const GENERATION_COST_BOUND_MICROS = 4_000_000;

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
