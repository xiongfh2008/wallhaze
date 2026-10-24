/**
 * Studio generation state machine (FE04-A).
 *
 * A pure, framework-free model of every phase a generation attempt can go
 * through — including the phases the CURRENT backend cannot reach yet
 * (async jobs, credits reservation). Shipping the full model now keeps the
 * future Auth + Credits + async-task integration a data-source swap instead
 * of a UI rewrite.
 *
 * Phases:
 * - idle          nothing in progress
 * - validating    local pre-flight checks (prompt/reference/form)
 * - confirmation  waiting for the user to confirm the request
 * - blocked       generation cannot start (auth / pricing / wallet missing)
 * - submitting    the POST is being sent
 * - generating    request accepted — waiting for the image
 * - succeeded     image received
 * - failed        terminal failure (network / http / invalid)
 * - canceled      the user aborted the in-flight request
 * - timed_out     the request exceeded the client budget
 *
 * Unknown transitions are ignored (the current phase is returned unchanged)
 * — a stale or duplicate event can never corrupt the machine.
 */

export const STUDIO_PHASES = [
  "idle",
  "validating",
  "confirmation",
  "blocked",
  "submitting",
  "generating",
  "succeeded",
  "failed",
  "canceled",
  "timed_out",
] as const;

export type StudioPhase = (typeof STUDIO_PHASES)[number];

export type StudioEvent =
  | { type: "START_VALIDATION" }
  | { type: "VALIDATION_PASSED" }
  | { type: "VALIDATION_FAILED" }
  | { type: "GATE_BLOCKED" }
  | { type: "CONFIRM" }
  | { type: "ABORT_CONFIRMATION" }
  | { type: "SUBMIT_ACCEPTED" }
  | { type: "SUCCEED" }
  | { type: "FAIL" }
  | { type: "CANCEL" }
  | { type: "TIMEOUT" }
  | { type: "RETRY" }
  | { type: "RESET" };

/**
 * Legal phase transitions. Deliberately conservative:
 * - only `submitting`/`generating` can reach the terminal result phases, so
 *   a result can only ever exist because a request was actually accepted;
 * - `blocked` can only be left via RESET/RETRY — there is no direct path
 *   from "blocked" to "submitting" without re-entering confirmation;
 * - RESET works from every non-idle phase (user discards the outcome).
 */
const TRANSITIONS: Record<
  StudioPhase,
  Partial<Record<StudioEvent["type"], StudioPhase>>
> = {
  idle: {
    START_VALIDATION: "validating",
  },
  validating: {
    VALIDATION_PASSED: "confirmation",
    VALIDATION_FAILED: "failed",
    GATE_BLOCKED: "blocked",
    CANCEL: "idle",
    RESET: "idle",
  },
  confirmation: {
    CONFIRM: "submitting",
    ABORT_CONFIRMATION: "idle",
    // The credits gate is evaluated at confirm time — if a service is
    // missing while the user stares at the dialog, the machine lands here.
    GATE_BLOCKED: "blocked",
    CANCEL: "idle",
    RESET: "idle",
  },
  blocked: {
    RESET: "idle",
    RETRY: "validating",
  },
  submitting: {
    SUBMIT_ACCEPTED: "generating",
    SUCCEED: "succeeded",
    FAIL: "failed",
    CANCEL: "canceled",
  },
  generating: {
    SUCCEED: "succeeded",
    FAIL: "failed",
    CANCEL: "canceled",
    TIMEOUT: "timed_out",
  },
  succeeded: {
    RESET: "idle",
    START_VALIDATION: "validating",
  },
  failed: {
    RESET: "idle",
    RETRY: "validating",
  },
  canceled: {
    RESET: "idle",
    RETRY: "validating",
  },
  timed_out: {
    RESET: "idle",
    RETRY: "validating",
  },
};

/** True when the value is one of the known studio phases. */
export function isStudioPhase(value: unknown): value is StudioPhase {
  return (
    typeof value === "string" &&
    (STUDIO_PHASES as readonly string[]).includes(value)
  );
}

/**
 * Applies one event to the machine. Unknown event/phase combinations leave
 * the phase untouched — callers can dispatch stale events without guards.
 */
export function transitionPhase(
  phase: StudioPhase,
  event: StudioEvent
): StudioPhase {
  return TRANSITIONS[phase][event.type] ?? phase;
}

/** True while a request is genuinely in flight (submitting or generating). */
export function isPhaseInFlight(phase: StudioPhase): boolean {
  return phase === "submitting" || phase === "generating";
}

/** True once the machine reached a terminal outcome of the last attempt. */
export function isPhaseTerminal(phase: StudioPhase): boolean {
  return (
    phase === "succeeded" ||
    phase === "failed" ||
    phase === "canceled" ||
    phase === "timed_out"
  );
}
