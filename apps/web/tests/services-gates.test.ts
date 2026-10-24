import { describe, expect, it, vi } from "vitest";
import {
  AUTH_SERVICES_CONFIGURED,
  authAdapter,
  getAuthStatus,
  oauthStartUrl,
} from "@/lib/api/auth";
import {
  CREDIT_WALLET_SERVICES_CONFIGURED,
  creditsAdapter,
} from "@/lib/api/credits";
import {
  CREATION_SERVICES_CONFIGURED,
  creationsAdapter,
} from "@/lib/api/creations";
import {
  ACCOUNT_SERVICES_CONFIGURED,
  accountAdapter,
} from "@/lib/api/account";
import { ORDER_SERVICES_CONFIGURED, ordersAdapter } from "@/lib/api/orders";
import { expectNoNetworkCalls, getBlockedNetworkCalls } from "./setup.safety";

/**
 * FE05–FE08 service gates: no Auth / wallet / payment / cloud-creations /
 * account / order backend exists yet. Every adapter method must return the
 * unified "unavailable" result, NOTHING may leave the process, and no gate
 * may be open (a closed gate is the structural block that keeps paid or
 * identity actions impossible — not a UI button state).
 */

async function expectUnavailable(promise: Promise<unknown>): Promise<void> {
  const result = (await promise) as { ok: boolean; failure?: { kind: string } };
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failure?.kind).toBe("unavailable");
  }
}

describe("service gates (FE05–FE08)", () => {
  it("every service gate is closed", () => {
    expect(AUTH_SERVICES_CONFIGURED).toBe(false);
    expect(CREDIT_WALLET_SERVICES_CONFIGURED).toBe(false);
    expect(CREATION_SERVICES_CONFIGURED).toBe(false);
    expect(ACCOUNT_SERVICES_CONFIGURED).toBe(false);
    expect(ORDER_SERVICES_CONFIGURED).toBe(false);
  });

  it("auth adapter: all methods unavailable, credentials discarded", async () => {
    await expectUnavailable(authAdapter.getSession());
    await expectUnavailable(authAdapter.getCurrentUser());
    await expectUnavailable(authAdapter.signInWithPassword("a@b.c", "pw"));
    await expectUnavailable(authAdapter.signUpWithPassword("a@b.c", "pw"));
    await expectUnavailable(authAdapter.signInWithGoogle());
    await expectUnavailable(authAdapter.getOAuthStatus());
    await expectUnavailable(authAdapter.getOAuthLinks());
    await expectUnavailable(authAdapter.signOut());
  });

  it("Google start URL is built only from the configured API base", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    expect(oauthStartUrl("signin", "/zh/account")).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:4000/");
    expect(oauthStartUrl("signin", "/zh/account")).toBe(
      "http://localhost:4000/v1/auth/oauth/google/start?returnTo=%2Fzh%2Faccount"
    );
    expect(oauthStartUrl("link", "/account/settings")).toBe(
      "http://localhost:4000/v1/auth/oauth/google/start?returnTo=%2Faccount%2Fsettings&mode=link"
    );
    vi.unstubAllEnvs();
  });

  it("getAuthStatus derives unavailable — never an authenticated state", async () => {
    expect(await getAuthStatus()).toEqual({ state: "unavailable" });
  });

  it("credits adapter: wallet, packages, transactions, checkout, orders all unavailable", async () => {
    await expectUnavailable(creditsAdapter.getWallet());
    await expectUnavailable(creditsAdapter.listCreditPackages());
    await expectUnavailable(creditsAdapter.listCreditTransactions());
    await expectUnavailable(
      creditsAdapter.createCheckout({
        packageId: "pkg_test",
        successUrl: "https://wallhaze.com/credits",
        cancelUrl: "https://wallhaze.com/credits",
      })
    );
    await expectUnavailable(creditsAdapter.listPaymentOrders());
  });

  it("creations adapter: list, get, delete, download all unavailable", async () => {
    await expectUnavailable(creationsAdapter.listCreations());
    await expectUnavailable(creationsAdapter.getCreation("id"));
    await expectUnavailable(creationsAdapter.deleteCreation("id"));
    await expectUnavailable(creationsAdapter.downloadCreation("id"));
  });

  it("account adapter: get, update preference, delete — all unavailable", async () => {
    await expectUnavailable(accountAdapter.getAccount());
    await expectUnavailable(
      accountAdapter.updateLanguagePreference({ locale: "en" })
    );
    await expectUnavailable(accountAdapter.deleteAccount());
  });

  it("orders adapter: list and get unavailable", async () => {
    await expectUnavailable(ordersAdapter.listOrders());
    await expectUnavailable(ordersAdapter.getOrder("id"));
  });

  it("safety self-check: zero outbound requests were attempted or blocked", () => {
    expect(getBlockedNetworkCalls()).toHaveLength(0);
    expectNoNetworkCalls();
  });
});
