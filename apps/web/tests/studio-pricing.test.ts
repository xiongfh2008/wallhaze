import { describe, expect, it } from "vitest";
import { resolveCreditsGate } from "@/lib/studio/pricing";

describe("credits gate", () => {
  it("allows submission only when auth, pricing and wallet are all available", () => {
    expect(
      resolveCreditsGate({
        authAvailable: true,
        pricingAvailable: true,
        walletAvailable: true,
      })
    ).toEqual({ canSubmit: true, reason: null });
  });

  it("checks dependencies in order: auth → pricing → wallet", () => {
    expect(
      resolveCreditsGate({
        authAvailable: false,
        pricingAvailable: false,
        walletAvailable: false,
      }).reason
    ).toBe("auth-unavailable");
    expect(
      resolveCreditsGate({
        authAvailable: true,
        pricingAvailable: false,
        walletAvailable: false,
      }).reason
    ).toBe("pricing-unavailable");
    expect(
      resolveCreditsGate({
        authAvailable: true,
        pricingAvailable: true,
        walletAvailable: false,
      }).reason
    ).toBe("wallet-unavailable");
  });

  it("never reports canSubmit for partial availability", () => {
    for (const authAvailable of [false, true]) {
      for (const pricingAvailable of [false, true]) {
        for (const walletAvailable of [false, true]) {
          const gate = resolveCreditsGate({
            authAvailable,
            pricingAvailable,
            walletAvailable,
          });
          expect(gate.canSubmit).toBe(
            authAvailable && pricingAvailable && walletAvailable
          );
          expect(gate.reason === null).toBe(gate.canSubmit);
        }
      }
    }
  });
});
