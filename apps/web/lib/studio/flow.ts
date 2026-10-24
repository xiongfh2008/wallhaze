/**
 * Generation flow driver (FE04-A).
 *
 * Wires the Studio state machine (state.ts), the credits gate (pricing.ts)
 * and the typed generation API call (lib/api/generation.ts) into one small,
 * fully testable controller.
 *
 * Structural safety rule: {@link GenerationFlow.confirm} checks the credits
 * gate BEFORE an executor can ever be invoked. With the FE04-A gate
 * (everything unavailable) no request leaves the app — the executor only
 * runs when the gate is open, which in tests is provided by an injected
 * in-process mock, never by a real paid endpoint.
 *
 * Stale-request protection: every confirmed submission captures a sequence
 * number; a late resolution from a superseded attempt is discarded, so an
 * old response can never overwrite a newer attempt's state.
 */

import type { GenerationRequest } from "@wallhaze/contracts";
import type { GenerateOutcome } from "@/lib/api/generation";
import {
  resolveCreditsGate,
  type CreditsGate,
  type CreditsGateInput,
} from "./pricing";
import {
  isPhaseTerminal,
  transitionPhase,
  type StudioEvent,
  type StudioPhase,
} from "./state";

/** The executable part of a submission — generateWallpaper in production,
 * an in-process mock in tests. */
export type GenerationExecutor = (
  input: GenerationRequest,
  options: { signal: AbortSignal }
) => Promise<GenerateOutcome>;

/** How the flow failed — the UI maps each to dedicated copy. */
export type GenerationFlowFailure =
  | { kind: "terminal"; phase: "failed" | "canceled" | "timed_out" }
  | { kind: "blocked"; reason: NonNullable<CreditsGate["reason"]> }
  | { kind: "validation" };

export interface GenerationFlowObserver {
  /** Phase changes (always called in order, one per transition). */
  onPhase?: (phase: StudioPhase) => void;
  /** Outcome of the last attempt, deduplicated by phase. */
  onOutcome?: (
    outcome:
      | { kind: "succeeded"; result: Extract<GenerateOutcome, { ok: true }> }
      | { kind: "failed"; failure: GenerationFlowFailure }
  ) => void;
}

export interface GenerationFlowOptions {
  /** Availability source evaluated at submit time — never cached. */
  gateInput: () => CreditsGateInput;
  /** The request executor (injected: real client in prod, mock in tests). */
  execute: GenerationExecutor;
  observer?: GenerationFlowObserver;
}

export interface GenerationFlow {
  readonly phase: StudioPhase;
  /** True while a confirmed request is in flight. */
  readonly inFlight: boolean;
  /** The last non-success outcome, for UI copy (canceled/timed_out/blocked). */
  readonly lastFailure: GenerationFlowFailure | null;
  /** Local pre-flight failed — caller shows its own validation message. */
  beginValidation(): void;
  validationPassed(): void;
  validationFailed(): void;
  /** Confirms the staged request. Blocked gates never reach the executor. */
  confirm(input: GenerationRequest): void;
  /** User dismissed the confirmation dialog. */
  dismissConfirmation(): void;
  /** Aborts the in-flight request (only affects the current attempt). */
  cancel(): void;
  /** From a terminal/blocked state: re-enter validating. */
  retry(): void;
  /** Back to idle, discarding the outcome. */
  reset(): void;
}

export function createGenerationFlow(
  options: GenerationFlowOptions
): GenerationFlow {
  let phase: StudioPhase = "idle";
  let seq = 0;
  let controller: AbortController | null = null;
  let lastFailure: GenerationFlowFailure | null = null;

  const dispatch = (event: StudioEvent): void => {
    const next = transitionPhase(phase, event);
    if (next !== phase) {
      phase = next;
      options.observer?.onPhase?.(phase);
    }
  };

  return {
    get phase() {
      return phase;
    },
    get inFlight() {
      return phase === "submitting" || phase === "generating";
    },
    get lastFailure() {
      return lastFailure;
    },

    beginValidation() {
      dispatch({ type: "START_VALIDATION" });
    },

    validationPassed() {
      dispatch({ type: "VALIDATION_PASSED" });
    },

    validationFailed() {
      lastFailure = { kind: "validation" };
      dispatch({ type: "VALIDATION_FAILED" });
      options.observer?.onOutcome?.({
        kind: "failed",
        failure: lastFailure,
      });
    },

    confirm(input: GenerationRequest) {
      // The gate is evaluated at submit time — presentation state cannot
      // unlock a submission the services cannot back.
      const gate = resolveCreditsGate(options.gateInput());
      if (!gate.canSubmit) {
        lastFailure = { kind: "blocked", reason: gate.reason! };
        dispatch({ type: "GATE_BLOCKED" });
        options.observer?.onOutcome?.({
          kind: "failed",
          failure: lastFailure,
        });
        return;
      }
      // Gate open — confirm and send. The sequence number marks THIS
      // attempt; superseded responses are ignored below.
      const attempt = ++seq;
      controller = new AbortController();
      dispatch({ type: "CONFIRM" });
      dispatch({ type: "SUBMIT_ACCEPTED" });

      void options.execute(input, { signal: controller.signal }).then(
        (outcome) => {
          if (attempt !== seq || isPhaseTerminal(phase)) return;
          controller = null;
          if (outcome.ok) {
            dispatch({ type: "SUCCEED" });
            options.observer?.onOutcome?.({ kind: "succeeded", result: outcome });
            return;
          }
          // Map typed failure reasons to honest terminal phases —
          // "canceled" is the user's abort, never "network".
          if (outcome.reason === "canceled") {
            lastFailure = { kind: "terminal", phase: "canceled" };
            dispatch({ type: "CANCEL" });
          } else if (outcome.reason === "timeout") {
            lastFailure = { kind: "terminal", phase: "timed_out" };
            dispatch({ type: "TIMEOUT" });
          } else {
            lastFailure = { kind: "terminal", phase: "failed" };
            dispatch({ type: "FAIL" });
          }
          options.observer?.onOutcome?.({ kind: "failed", failure: lastFailure! });
        },
        () => {
          // The executor contract is "never rejects"; treat any surprise
          // rejection as a plain failure instead of an unhandled rejection.
          if (attempt !== seq || isPhaseTerminal(phase)) return;
          controller = null;
          lastFailure = { kind: "terminal", phase: "failed" };
          dispatch({ type: "FAIL" });
          options.observer?.onOutcome?.({ kind: "failed", failure: lastFailure });
        }
      );
    },

    dismissConfirmation() {
      dispatch({ type: "ABORT_CONFIRMATION" });
    },

    cancel() {
      // Aborts only the current attempt; if nothing is in flight this is a
      // no-op (the transition table rejects CANCEL from non-flight phases).
      controller?.abort();
      dispatch({ type: "CANCEL" });
    },

    retry() {
      dispatch({ type: "RETRY" });
    },

    reset() {
      dispatch({ type: "RESET" });
    },
  };
}
