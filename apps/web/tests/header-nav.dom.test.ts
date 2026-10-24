/**
 * Header navigation contract (jsdom).
 *
 * The header must derive signed-in state from the real session probe, show a
 * backend-provided spendable balance (never a hardcoded number), expose the
 * account menu with keyboard support, and remove the Create Wallpaper CTA
 * when it would be redundant (signed in, or already on /studio).
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import {
  createElement,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({
  pathname: "/wallpapers",
  user: null as null | {
    id: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  },
  sessionFailureStatus: null as number | null,
  walletPending: false,
  walletFailureStatus: null as number | null,
  walletFailure: false,
  credits: 120,
  reserved: 20,
  signOutOk: true,
  signOutCalls: 0,
  refreshed: 0,
}));

vi.mock("next-intl", async () => {
  const { default: en } = await import("../messages/en.json");
  const messages = en as unknown as Record<string, Record<string, string>>;
  return {
    useLocale: () => "en",
    useTranslations:
      (namespace: string) =>
      (key: string): string =>
        messages[namespace]?.[key] ?? `${namespace}.${key}`,
  };
});

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...rest }, children),
  usePathname: () => state.pathname,
  useRouter: () => ({
    refresh: () => {
      state.refreshed += 1;
    },
  }),
}));

vi.mock("@/components/LanguageSwitcher", () => ({
  default: ({ className }: { className?: string }) =>
    createElement("div", { "data-testid": "language-switcher", className }),
}));

vi.mock("@/lib/api/auth", () => ({
  AUTH_SERVICES_CONFIGURED: true,
  authAdapter: {
    getSession: async () => {
      if (state.sessionFailureStatus !== null) {
        return {
          ok: false,
          failure: { kind: "network" },
          status: state.sessionFailureStatus,
        };
      }
      return {
        ok: true,
        data: state.user ? { user: state.user, expiresAt: null } : null,
      };
    },
    signOut: async () => {
      state.signOutCalls += 1;
      if (!state.signOutOk) {
        return { ok: false, failure: { kind: "network" }, status: null };
      }
      state.user = null;
      return { ok: true, data: null };
    },
  },
}));

vi.mock("@/lib/api/credits", () => ({
  creditsAdapter: {
    getWallet: async () => {
      if (state.walletPending) return new Promise(() => {});
      if (state.walletFailureStatus !== null || state.walletFailure) {
        return {
          ok: false,
          failure:
            state.walletFailureStatus === 401
              ? { kind: "auth" }
              : { kind: "network" },
          status: state.walletFailureStatus,
        };
      }
      return {
        ok: true,
        data: {
          credits: state.credits,
          reserved: state.reserved,
          updatedAt: null,
        },
      };
    },
  },
}));

import Header from "@/components/Header";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const signedInUser = {
  id: "user-1",
  email: "alex@example.com",
  displayName: "Alex Rivera",
  avatarUrl: null,
};

beforeEach(() => {
  state.pathname = "/wallpapers";
  state.user = null;
  state.sessionFailureStatus = null;
  state.walletPending = false;
  state.walletFailureStatus = null;
  state.walletFailure = false;
  state.credits = 120;
  state.reserved = 20;
  state.signOutOk = true;
  state.signOutCalls = 0;
  state.refreshed = 0;
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderHeader(pathname = "/wallpapers"): Promise<HTMLDivElement> {
  state.pathname = pathname;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Header));
  });
  await flush();
  return container;
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function linkByText(scope: ParentNode, text: string): HTMLAnchorElement | null {
  return (
    Array.from(scope.querySelectorAll("a")).find(
      (anchor) => anchor.textContent?.trim() === text
    ) ?? null
  );
}

function navLabels(scope: ParentNode): string[] {
  return Array.from(scope.querySelectorAll("nav a")).map(
    (anchor) => anchor.textContent?.trim() ?? ""
  );
}

describe("Header signed-out navigation", () => {
  it("shows Explore + AI Studio + Community, Log in and Create Wallpaper", async () => {
    const view = await renderHeader();

    const nav = view.querySelector('nav[aria-label="Main"]');
    expect(nav).not.toBeNull();
    expect(navLabels(nav as Element)).toEqual([
      "Explore Wallpapers",
      "AI Studio",
      "Community",
    ]);
    expect(nav?.textContent).not.toContain("My Creations");
    expect(nav?.textContent).not.toContain("Credits");

    expect(linkByText(view, "Log in")).not.toBeNull();
    expect(linkByText(view, "Create Wallpaper")).not.toBeNull();
    expect(view.querySelector('[aria-label^="Account menu"]')).toBeNull();
    expect(view.querySelector('a[aria-label^="Available Credits"]')).toBeNull();
  });

  it("highlights the active route and removes the Studio CTA on /studio", async () => {
    const view = await renderHeader("/studio");
    const nav = view.querySelector('nav[aria-label="Main"]');
    const studio = linkByText(nav as Element, "AI Studio");

    expect(studio?.getAttribute("aria-current")).toBe("page");
    expect(linkByText(nav as Element, "Explore Wallpapers")?.getAttribute("aria-current")).toBeNull();
    // Already in the Studio: the header must not offer a second entry.
    expect(linkByText(view, "Create Wallpaper")).toBeNull();
    expect(linkByText(view, "Log in")).not.toBeNull();
  });

  it("opens the mobile panel with nav, sign-in, create and language", async () => {
    const view = await renderHeader();
    const trigger = view.querySelector<HTMLButtonElement>(
      'button[aria-controls="mobile-navigation"]'
    );
    expect(trigger).not.toBeNull();

    await click(trigger as HTMLButtonElement);
    const panel = view.querySelector("#mobile-navigation");
    expect(panel).not.toBeNull();
    expect(navLabels(panel as Element)).toEqual([
      "Explore Wallpapers",
      "AI Studio",
      "Community",
    ]);
    expect(linkByText(panel as Element, "Log in")).not.toBeNull();
    expect(linkByText(panel as Element, "Create Wallpaper")).not.toBeNull();
    expect(
      panel?.querySelector('[data-testid="language-switcher"]')
    ).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(view.querySelector("#mobile-navigation")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("Header signed-in navigation", () => {
  it("shows My Creations, the real spendable balance and the account menu", async () => {
    state.user = signedInUser;
    const view = await renderHeader();

    const nav = view.querySelector('nav[aria-label="Main"]');
    expect(navLabels(nav as Element)).toEqual([
      "Explore Wallpapers",
      "AI Studio",
      "Community",
      "My Creations",
    ]);
    // Backend wallet: 120 total - 20 reserved = 100 spendable.
    const chip = view.querySelector('a[aria-label="Available Credits: 100"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("100");
    expect(view.querySelector('a[aria-label="Available Credits: 120"]')).toBeNull();
    // Desktop signed-in navigation has no Create CTA; the compact mobile
    // header keeps the primary creation entry for small screens.
    const desktopActions = view.querySelector(
      '[data-testid="header-desktop-actions"]'
    );
    expect(linkByText(desktopActions as Element, "Create Wallpaper")).toBeNull();
    const mobileActions = view.querySelector(
      '[data-testid="header-mobile-actions"]'
    );
    expect(linkByText(mobileActions as Element, "Create Wallpaper")).not.toBeNull();

    const trigger = view.querySelector<HTMLButtonElement>(
      '[aria-label^="Account menu"]'
    );
    expect(trigger).not.toBeNull();
    await click(trigger as HTMLButtonElement);

    const menu = view.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("Alex Rivera");
    expect(menu?.textContent).toContain("alex@example.com");
    expect(linkByText(menu as Element, "My account")).not.toBeNull();
    expect(linkByText(menu as Element, "Account settings")?.getAttribute("href")).toBe(
      "/account/settings"
    );
    expect(menu?.textContent).toContain("Credits & billing");
    expect(menu?.textContent).toContain("Log out");
  });

  it("marks the Credits chip as current on the Credits page", async () => {
    state.user = signedInUser;
    const view = await renderHeader("/credits");
    const chip = view.querySelector('a[aria-label="Available Credits: 100"]');
    expect(chip?.getAttribute("aria-current")).toBe("page");
  });

  it("hides the Create CTA inside Studio for signed-in users too", async () => {
    state.user = signedInUser;
    const view = await renderHeader("/studio");

    const nav = view.querySelector('nav[aria-label="Main"]');
    expect(linkByText(nav as Element, "AI Studio")?.getAttribute("aria-current")).toBe(
      "page"
    );
    expect(linkByText(view, "Create Wallpaper")).toBeNull();
    expect(
      view.querySelector('[data-testid="header-desktop-actions"]')?.textContent
    ).toContain("Credits");
  });

  it("supports focus, arrow navigation and Escape in the account menu", async () => {
    state.user = signedInUser;
    const view = await renderHeader();
    const trigger = view.querySelector<HTMLButtonElement>(
      '[aria-label^="Account menu"]'
    );

    await click(trigger as HTMLButtonElement);
    await flush();
    expect(document.activeElement?.textContent?.trim()).toBe("My account");

    const menu = view.querySelector('[role="menu"]');
    await act(async () => {
      menu?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });
    expect(document.activeElement?.textContent?.trim()).toBe(
      "Account settings"
    );

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(view.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("logs out immediately and returns the header to its signed-out state", async () => {
    state.user = signedInUser;
    const view = await renderHeader();
    const trigger = view.querySelector<HTMLButtonElement>(
      '[aria-label^="Account menu"]'
    );
    await click(trigger as HTMLButtonElement);

    const logOut = Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Log out"
    );
    expect(logOut).toBeTruthy();
    await click(logOut as HTMLButtonElement);
    await flush();

    expect(state.signOutCalls).toBe(1);
    expect(state.refreshed).toBe(1);
    expect(view.querySelector('[aria-label^="Account menu"]')).toBeNull();
    expect(view.querySelector('a[aria-label^="Available Credits"]')).toBeNull();
    expect(
      navLabels(view.querySelector('nav[aria-label="Main"]') as Element)
    ).toEqual(["Explore Wallpapers", "AI Studio", "Community"]);
    expect(linkByText(view, "Log in")).not.toBeNull();
  });

  it("handles wallet loading and unavailable states without inventing a balance", async () => {
    state.user = signedInUser;
    state.walletPending = true;
    let view = await renderHeader();

    const loading = view.querySelector('a[aria-label="Loading Credits"]');
    expect(loading).not.toBeNull();
    expect(loading?.getAttribute("aria-busy")).toBe("true");
    expect(loading?.textContent).toContain("…");

    act(() => root?.unmount());
    container?.remove();
    state.walletPending = false;
    state.walletFailure = true;
    state.user = signedInUser;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(Header));
    });
    await flush();

    view = container;
    const unavailable = view.querySelector(
      'a[aria-label="Credits unavailable"]'
    );
    expect(unavailable).not.toBeNull();
    expect(unavailable?.textContent).toContain("—");
    expect(view.querySelector('[aria-label^="Account menu"]')).not.toBeNull();
  });

  it("drops the account menu when the wallet confirms an expired session", async () => {
    state.user = signedInUser;
    state.walletFailureStatus = 401;
    const view = await renderHeader();

    expect(view.querySelector('[aria-label^="Account menu"]')).toBeNull();
    expect(view.querySelector('a[aria-label^="Available Credits"]')).toBeNull();
    expect(linkByText(view, "Log in")).not.toBeNull();
    expect(
      navLabels(view.querySelector('nav[aria-label="Main"]') as Element)
    ).toEqual(["Explore Wallpapers", "AI Studio", "Community"]);
  });
});
