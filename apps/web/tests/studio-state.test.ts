import { describe, expect, it } from "vitest";
import {
  STUDIO_PHASES,
  isPhaseInFlight,
  isPhaseTerminal,
  isStudioPhase,
  transitionPhase,
  type StudioEvent,
  type StudioPhase,
} from "@/lib/studio/state";

/** Drives a chain of event types and returns the final phase. */
function run(start: StudioPhase, events: StudioEvent["type"][]): StudioPhase {
  return events.reduce<StudioPhase>(
    (phase, type) => transitionPhase(phase, { type }),
    start
  );
}

describe("studio generation state machine", () => {
  it("exposes exactly the ten contract phases", () => {
    expect([...STUDIO_PHASES]).toEqual([
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
    ]);
  });

  it("walks the full happy path from idle to succeeded and back", () => {
    expect(
      run("idle", [
        "START_VALIDATION",
        "VALIDATION_PASSED",
        "CONFIRM",
        "SUBMIT_ACCEPTED",
        "SUCCEED",
      ])
    ).toBe("succeeded");
    expect(
      run("succeeded", ["RESET"])
    ).toBe("idle");
  });

  it("supports re-entering validation directly from succeeded", () => {
    expect(transitionPhase("succeeded", { type: "START_VALIDATION" })).toBe(
      "validating"
    );
  });

  it("routes validation failure to failed and back via retry", () => {
    expect(
      run("validating", ["VALIDATION_FAILED"])
    ).toBe("failed");
    expect(run("failed", ["RETRY"])).toBe("validating");
    expect(run("failed", ["RESET"])).toBe("idle");
  });

  it("routes a blocked gate to blocked, reachable only via retry/reset", () => {
    expect(run("validating", ["GATE_BLOCKED"])).toBe("blocked");
    expect(run("blocked", ["RETRY"])).toBe("validating");
    expect(run("blocked", ["RESET"])).toBe("idle");
    // No shortcut from blocked to submitting without re-confirmation.
    expect(transitionPhase("blocked", { type: "CONFIRM" })).toBe("blocked");
  });

  it("accepts cancellation from both flight phases", () => {
    expect(
      run("idle", ["START_VALIDATION", "VALIDATION_PASSED", "CONFIRM", "CANCEL"])
    ).toBe("canceled");
    expect(
      run("idle", [
        "START_VALIDATION",
        "VALIDATION_PASSED",
        "CONFIRM",
        "SUBMIT_ACCEPTED",
        "CANCEL",
      ])
    ).toBe("canceled");
    expect(run("canceled", ["RETRY"])).toBe("validating");
    expect(run("canceled", ["RESET"])).toBe("idle");
  });

  it("accepts timeout only while generating", () => {
    expect(transitionPhase("generating", { type: "TIMEOUT" })).toBe("timed_out");
    // submitting has no TIMEOUT edge — the client budget lives above it.
    expect(transitionPhase("submitting", { type: "TIMEOUT" })).toBe(
      "submitting"
    );
    expect(run("timed_out", ["RESET"])).toBe("idle");
  });

  it("aborts confirmation back to idle", () => {
    expect(
      run("idle", ["START_VALIDATION", "VALIDATION_PASSED", "ABORT_CONFIRMATION"])
    ).toBe("idle");
  });

  it("ignores events that are illegal for the current phase", () => {
    // A terminal result can only exist because a request was accepted.
    expect(transitionPhase("confirmation", { type: "SUCCEED" })).toBe(
      "confirmation"
    );
    expect(transitionPhase("idle", { type: "SUCCEED" })).toBe("idle");
    expect(transitionPhase("idle", { type: "FAIL" })).toBe("idle");
    expect(transitionPhase("blocked", { type: "SUCCEED" })).toBe("blocked");
    expect(transitionPhase("generating", { type: "START_VALIDATION" })).toBe(
      "generating"
    );
    expect(transitionPhase("generating", { type: "CONFIRM" })).toBe(
      "generating"
    );
    // The gate check lives in confirm — a blocked result is reachable from
    // both validating and confirmation, never from a flight phase.
    expect(transitionPhase("confirmation", { type: "GATE_BLOCKED" })).toBe(
      "blocked"
    );
    expect(transitionPhase("submitting", { type: "GATE_BLOCKED" })).toBe(
      "submitting"
    );
    expect(transitionPhase("canceled", { type: "SUCCEED" })).toBe("canceled");
    expect(transitionPhase("timed_out", { type: "SUBMIT_ACCEPTED" })).toBe(
      "timed_out"
    );
    expect(transitionPhase("succeeded", { type: "FAIL" })).toBe("succeeded");
  });

  it("classifies phase values safely", () => {
    for (const phase of STUDIO_PHASES) {
      expect(isStudioPhase(phase)).toBe(true);
    }
    expect(isStudioPhase("queued")).toBe(false);
    expect(isStudioPhase(42)).toBe(false);
    expect(isStudioPhase(null)).toBe(false);
  });

  it("marks only submitting/generating as in flight", () => {
    expect(isPhaseInFlight("submitting")).toBe(true);
    expect(isPhaseInFlight("generating")).toBe(true);
    for (const phase of ["idle", "validating", "confirmation", "blocked", "succeeded", "failed", "canceled", "timed_out"] as const) {
      expect(isPhaseInFlight(phase)).toBe(false);
    }
  });

  it("marks only the four outcome phases as terminal", () => {
    for (const phase of ["succeeded", "failed", "canceled", "timed_out"] as const) {
      expect(isPhaseTerminal(phase)).toBe(true);
    }
    for (const phase of ["idle", "validating", "confirmation", "blocked", "submitting", "generating"] as const) {
      expect(isPhaseTerminal(phase)).toBe(false);
    }
  });
});
