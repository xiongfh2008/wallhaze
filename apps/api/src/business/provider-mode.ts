/**
 * Generation mode selection (fail-closed).
 *
 * Real billing is NEVER enabled merely because FAL_KEY exists:
 * - FAL_MOCK=1/true wins and forces the in-process mock;
 * - real fal.ai requires BOTH FAL_LIVE_ENABLED=1/true AND a non-empty FAL_KEY;
 * - everything else is "disabled" (no provider, no paid calls).
 *
 * This is intentionally explicit so a test key or a copied environment cannot
 * silently turn on paid traffic.
 */

export type GenerationMode = "mock" | "live" | "disabled";

export function isFlagEnabled(value: string | undefined): boolean {
  return ["1", "true"].includes((value ?? "").trim().toLowerCase());
}

export function resolveGenerationMode(env: {
  FAL_MOCK?: string;
  FAL_LIVE_ENABLED?: string;
  FAL_KEY?: string;
}): GenerationMode {
  if (isFlagEnabled(env.FAL_MOCK)) return "mock";
  if (isFlagEnabled(env.FAL_LIVE_ENABLED) && (env.FAL_KEY ?? "").trim().length > 0) {
    return "live";
  }
  return "disabled";
}

/**
 * Video live traffic has an INDEPENDENT opt-in. FAL_LIVE_ENABLED alone is
 * for images; video requires both flags plus a key. This prevents an image
 * live rollout from silently enabling paid video calls.
 */
export function isVideoLiveAllowed(env: {
  FAL_LIVE_ENABLED?: string;
  FAL_VIDEO_LIVE_ENABLED?: string;
  FAL_KEY?: string;
}): boolean {
  return (
    isFlagEnabled(env.FAL_LIVE_ENABLED) &&
    isFlagEnabled(env.FAL_VIDEO_LIVE_ENABLED) &&
    (env.FAL_KEY ?? "").trim().length > 0
  );
}
