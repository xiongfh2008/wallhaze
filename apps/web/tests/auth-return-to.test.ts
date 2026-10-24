import { describe, expect, it } from "vitest";
import { localizePath, loginHref, safeNextPath } from "@/lib/auth/return-to";

/**
 * Post-login return paths must stay on this site. These are the client-side
 * checks that build `?next=` links; the API validates the OAuth `returnTo`
 * independently.
 */
describe("post-login return paths", () => {
  it("falls back for missing, external, protocol-relative and auth pages", () => {
    expect(safeNextPath(null)).toBe("/account");
    expect(safeNextPath(undefined)).toBe("/account");
    expect(safeNextPath("https://evil.example/studio")).toBe("/account");
    expect(safeNextPath("//evil.example/studio")).toBe("/account");
    expect(safeNextPath("/login")).toBe("/account");
    expect(safeNextPath("/login?next=%2Fstudio")).toBe("/account");
    expect(safeNextPath("/signup?x=1")).toBe("/account");
    expect(safeNextPath("/studio\u0000")).toBe("/account");
    expect(safeNextPath(`/${"a".repeat(600)}`)).toBe("/account");
  });

  it("keeps valid same-site paths", () => {
    expect(safeNextPath("/account")).toBe("/account");
    expect(safeNextPath("/studio")).toBe("/studio");
    expect(safeNextPath("/zh/credits")).toBe("/zh/credits");
    expect(safeNextPath("/my-creations?tab=history")).toBe(
      "/my-creations?tab=history"
    );
  });

  it("builds a login link that carries the intended page", () => {
    expect(loginHref("/studio")).toBe("/login?next=%2Fstudio");
    expect(loginHref("/zh/credits")).toBe("/login?next=%2Fzh%2Fcredits");
    expect(loginHref("https://evil.example")).toBe("/login");
    expect(loginHref("/login")).toBe("/login");
  });

  it("localizes paths for the OAuth return URL", () => {
    expect(localizePath("zh", "/studio")).toBe("/zh/studio");
    expect(localizePath("zh", "/zh/studio")).toBe("/zh/studio");
    expect(localizePath("en", "/studio")).toBe("/studio");
    expect(localizePath("ja", "/account/settings")).toBe(
      "/ja/account/settings"
    );
    expect(localizePath("zh", "https://evil.example")).toBe("/zh/account");
  });
});
