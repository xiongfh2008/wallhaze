import { describe, expect, it, vi } from "vitest";
import type { GenerationRequest } from "@wallhaze/contracts";
import type { GenerateOutcome } from "@/lib/api/generation";
import {
  createGenerationFlow,
  type GenerationFlow,
} from "@/lib/studio/flow";
import type { GenerationFlowObserver } from "@/lib/studio/flow";

const REQUEST: GenerationRequest = { device: "phone" };

const SUCCESS: GenerateOutcome = {
  ok: true,
  imageUrl: "https://cdn.test/wallpaper.png",
  width: 1080,
  height: 1920,
  contentType: "image/png",
};

const OPEN_GATE = () => ({
  authAvailable: true,
  pricingAvailable: true,
  walletAvailable: true,
});
const CLOSED_GATE = () => ({
  authAvailable: false,
  pricingAvailable: false,
  walletAvailable: false,
});

/** Executor whose promises the test resolves manually. */
function deferredExecutor() {
  const resolvers: Array<(outcome: GenerateOutcome) => void> = [];
  type Executor = (
    input: GenerationRequest,
    options: { signal: AbortSignal }
  ) => Promise<GenerateOutcome>;
  const execute = vi.fn<Executor>(
    () =>
      new Promise<GenerateOutcome>((resolve) => {
        resolvers.push(resolve);
      })
  );
  return {
    execute,
    resolveAt(index: number, outcome: GenerateOutcome) {
      resolvers[index](outcome);
    },
  };
}

function createObservedFlow(gateInput = OPEN_GATE) {
  const onPhase = vi.fn();
  const onOutcome = vi.fn();
  const { execute, resolveAt } = deferredExecutor();
  const observer: GenerationFlowObserver = { onPhase, onOutcome };
  const flow: GenerationFlow = createGenerationFlow({
    gateInput,
    execute,
    observer,
  });
  return { flow, execute, resolveAt, onPhase, onOutcome };
}

/** Walks idle → validating → confirmation. */
function stageConfirmation(flow: GenerationFlow): void {
  flow.beginValidation();
  flow.validationPassed();
}

/** Lets the confirm-side promise chain settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("generation flow — credits gate", () => {
  it("never reaches the executor while the gate is closed", () => {
    const { flow, execute, onOutcome } = createObservedFlow(CLOSED_GATE);
    stageConfirmation(flow);
    flow.confirm(REQUEST);

    expect(flow.phase).toBe("blocked");
    expect(flow.inFlight).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(flow.lastFailure).toEqual({
      kind: "blocked",
      reason: "auth-unavailable",
    });
    expect(onOutcome).toHaveBeenCalledWith({
      kind: "failed",
      failure: { kind: "blocked", reason: "auth-unavailable" },
    });

    // Blocked recovers only through retry or reset.
    flow.retry();
    expect(flow.phase).toBe("validating");
  });

  it("evaluates the gate at confirm time, not at creation", () => {
    let open = false;
    const { flow, execute } = createObservedFlow(() => ({
      authAvailable: open,
      pricingAvailable: open,
      walletAvailable: open,
    }));

    stageConfirmation(flow);
    flow.confirm(REQUEST);
    expect(flow.phase).toBe("blocked");
    expect(execute).not.toHaveBeenCalled();

    flow.reset();
    open = true;
    stageConfirmation(flow);
    flow.confirm(REQUEST);
    expect(flow.inFlight).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("generation flow — outcomes", () => {
  it("stays in confirmation until the user confirms", () => {
    const { flow, execute } = createObservedFlow();
    stageConfirmation(flow);
    expect(flow.phase).toBe("confirmation");
    expect(execute).not.toHaveBeenCalled();
  });

  it("moves to generating synchronously and succeeds on the outcome", async () => {
    const { flow, execute, resolveAt, onOutcome, onPhase } = createObservedFlow();
    stageConfirmation(flow);
    flow.confirm(REQUEST);

    expect(flow.phase).toBe("generating");
    expect(flow.inFlight).toBe(true);
    const [, options] = execute.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);

    resolveAt(0, SUCCESS);
    await flush();

    expect(flow.phase).toBe("succeeded");
    expect(flow.inFlight).toBe(false);
    expect(flow.lastFailure).toBeNull();
    expect(onOutcome).toHaveBeenCalledWith({ kind: "succeeded", result: SUCCESS });
    expect(onPhase.mock.calls.map(([phase]) => phase)).toEqual([
      "validating",
      "confirmation",
      "submitting",
      "generating",
      "succeeded",
    ]);
  });

  it("maps a canceled outcome to canceled — never a network failure", async () => {
    const { flow, resolveAt, onOutcome } = createObservedFlow();
    stageConfirmation(flow);
    flow.confirm(REQUEST);

    resolveAt(0, { ok: false, reason: "canceled", message: null });
    await flush();

    expect(flow.phase).toBe("canceled");
    expect(flow.lastFailure).toEqual({ kind: "terminal", phase: "canceled" });
    expect(onOutcome).toHaveBeenCalledWith({
      kind: "failed",
      failure: { kind: "terminal", phase: "canceled" },
    });
  });

  it("maps a timeout outcome to timed_out", async () => {
    const { flow, resolveAt } = createObservedFlow();
    stageConfirmation(flow);
    flow.confirm(REQUEST);

    resolveAt(0, { ok: false, reason: "timeout", message: null });
    await flush();

    expect(flow.phase).toBe("timed_out");
    expect(flow.lastFailure).toEqual({ kind: "terminal", phase: "timed_out" });
  });

  it("maps http and network outcomes to failed", async () => {
    const first = createObservedFlow();
    stageConfirmation(first.flow);
    first.flow.confirm(REQUEST);
    first.resolveAt(0, {
      ok: false,
      reason: "http",
      message: "slow down",
      code: "RATE_LIMITED",
      retryAfterSeconds: 7,
    });
    await flush();
    expect(first.flow.phase).toBe("failed");
    expect(first.flow.lastFailure).toEqual({ kind: "terminal", phase: "failed" });

    const second = createObservedFlow();
    stageConfirmation(second.flow);
    second.flow.confirm(REQUEST);
    second.resolveAt(0, { ok: false, reason: "network", message: null });
    await flush();
    expect(second.flow.phase).toBe("failed");
  });

  it("treats an unexpected executor rejection as failed", async () => {
    const onOutcome = vi.fn();
    const execute = vi.fn(
      () => Promise.reject(new Error("executor exploded"))
    );
    const flow = createGenerationFlow({
      gateInput: OPEN_GATE,
      execute,
      observer: { onOutcome },
    });
    stageConfirmation(flow);
    flow.confirm(REQUEST);
    await flush();

    expect(flow.phase).toBe("failed");
    expect(onOutcome).toHaveBeenCalledWith({
      kind: "failed",
      failure: { kind: "terminal", phase: "failed" },
    });
  });

  it("surfaces validation failures without touching the executor", () => {
    const { flow, execute, onOutcome } = createObservedFlow();
    flow.beginValidation();
    flow.validationFailed();

    expect(flow.phase).toBe("failed");
    expect(flow.lastFailure).toEqual({ kind: "validation" });
    expect(onOutcome).toHaveBeenCalledWith({
      kind: "failed",
      failure: { kind: "validation" },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns to idle when the confirmation is dismissed", () => {
    const { flow } = createObservedFlow();
    stageConfirmation(flow);
    flow.dismissConfirmation();
    expect(flow.phase).toBe("idle");
  });
});

describe("generation flow — cancellation and stale responses", () => {
  it("cancel aborts the signal and a late success is discarded", async () => {
    const { flow, execute, resolveAt, onOutcome } = createObservedFlow();
    stageConfirmation(flow);
    flow.confirm(REQUEST);
    expect(flow.phase).toBe("generating");

    flow.cancel();
    expect(flow.phase).toBe("canceled");
    expect(flow.inFlight).toBe(false);
    const [, options] = execute.mock.calls[0];
    expect(options.signal.aborted).toBe(true);

    // The superseded attempt's response arrives late — ignored.
    resolveAt(0, SUCCESS);
    await flush();

    expect(flow.phase).toBe("canceled");
    expect(onOutcome).not.toHaveBeenCalledWith({
      kind: "succeeded",
      result: SUCCESS,
    });
  });

  it("a stale response never overwrites a newer attempt", async () => {
    const { flow, execute, resolveAt } = createObservedFlow();

    // Attempt 1 — canceled by the user.
    stageConfirmation(flow);
    flow.confirm(REQUEST);
    flow.cancel();
    expect(flow.phase).toBe("canceled");

    // Attempt 2 — started fresh after a reset.
    flow.reset();
    stageConfirmation(flow);
    flow.confirm(REQUEST);
    expect(flow.phase).toBe("generating");
    expect(execute).toHaveBeenCalledTimes(2);

    // Attempt 1's late success must not finish attempt 2.
    resolveAt(0, SUCCESS);
    await flush();
    expect(flow.phase).toBe("generating");

    // Attempt 2's own response does.
    resolveAt(1, SUCCESS);
    await flush();
    expect(flow.phase).toBe("succeeded");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
