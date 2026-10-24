import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api/client";
import { authAdapter } from "@/lib/api/auth";
import { creditsAdapter } from "@/lib/api/credits";

afterEach(() => vi.unstubAllEnvs());
describe("credentialed business transport", () => {
  it("includes cookies and the CSRF marker on writes", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ id: "real" }));
    await apiRequest("/v1/auth/login", { baseUrl: "https://api.test", method: "POST", body: { email: "a@b.co", password: "secret" }, fetchImpl: transport });
    const init = transport.mock.calls[0][1]!;
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({ "X-WallHaze-Client": "web" });
  });
  it("accepts a successful null session/logout payload", async () => {
    expect(await apiRequest("/v1/auth/session", { baseUrl: "https://api.test", fetchImpl: async () => Response.json(null) })).toEqual({ ok: true, data: null });
  });
  it("connects password login to configured API without collecting a token", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    const session = { user: { id: "u", email: "a@b.co", displayName: null, avatarUrl: null }, expiresAt: null };
    const transport = vi.fn<typeof fetch>(async () => Response.json(session));
    vi.stubGlobal("fetch", transport);
    expect(await authAdapter.signInWithPassword("a@b.co", "secret")).toEqual({ ok: true, data: session });
    expect(transport.mock.calls[0][0]).toBe("https://api.test/v1/auth/login");
    expect(JSON.parse(transport.mock.calls[0][1]!.body as string)).toEqual({ email: "a@b.co", password: "secret" });
  });
  it("uses an idempotency key for checkout and keeps OAuth unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    const transport = vi.fn<typeof fetch>(async () => Response.json({ orderId: "o", checkoutUrl: "https://pay.test" }));
    vi.stubGlobal("fetch", transport);
    await creditsAdapter.createCheckout({ packageId: "p", successUrl: "https://web.test/credits", cancelUrl: "https://web.test/credits" }, "stable-key");
    expect(transport.mock.calls[0][1]!.headers).toMatchObject({ "Idempotency-Key": "stable-key" });
    expect(await authAdapter.signInWithGoogle()).toMatchObject({ ok: false, failure: { kind: "unavailable" } });
  });
});
