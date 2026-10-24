"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import Button from "./ui/Button";
import AccountMenu, { type CreditsStatus } from "./account/AccountMenu";
import UserAvatar from "./account/UserAvatar";
import {
  AUTH_SERVICES_CONFIGURED,
  authAdapter,
  type AuthUser,
} from "@/lib/api/auth";
import { creditsAdapter } from "@/lib/api/credits";
import { loginHref } from "@/lib/auth/return-to";

interface HeaderProps {
  /** Keep the header aligned with the page's content container. */
  maxWidthClassName?: string;
}

interface NavLink {
  label: string;
  href: string;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function CreditsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 text-violet-300"
      aria-hidden
    >
      <path d="m12 3 7 9-7 9-7-9 7-9Z" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden
    >
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

function ActiveDot() {
  return (
    <span
      aria-hidden
      className="ml-1.5 inline-block h-1 w-1 rounded-full bg-violet-300 align-middle"
    />
  );
}

function CreditsChip({
  availableCredits,
  status,
  display,
  label,
  compact = false,
  active = false,
}: {
  availableCredits: number | null;
  status: CreditsStatus;
  display: string;
  label: string;
  compact?: boolean;
  active?: boolean;
}) {
  const t = useTranslations("nav");

  return (
    <Link
      href="/credits"
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      aria-busy={status === "loading" || undefined}
      className={`inline-flex ${
        compact ? "h-10" : "h-9"
      } items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
        active
          ? "border-violet-400/50 bg-violet-500/15 text-white"
          : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/25 hover:bg-white/[0.08]"
      }`}
    >
      <CreditsIcon />
      <span className="text-zinc-400">{t("credits")}</span>
      <span
        aria-hidden
        className={`min-w-[1.35rem] text-right tabular-nums ${
          availableCredits === null && status !== "ready"
            ? "text-zinc-500"
            : "text-white"
        }`}
      >
        {display}
      </span>
    </Link>
  );
}

export default function Header({
  maxWidthClassName = "max-w-6xl",
}: HeaderProps = {}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [credits, setCredits] = useState<{
    available: number | null;
    status: CreditsStatus;
  }>({ available: null, status: "loading" });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  const headerRef = useRef<HTMLElement | null>(null);
  const mobileButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobilePanelRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef(0);

  const isStudio = pathname === "/studio" || pathname.startsWith("/studio/");
  const creditsActive = isActive(pathname, "/credits");

  // The session probe is the only source of signed-in state. It re-runs on
  // navigation and when the tab regains focus, so an expired cookie drops the
  // account menu and balance instead of leaving a stale signed-in header.
  useEffect(() => {
    if (!AUTH_SERVICES_CONFIGURED) return;
    let cancelled = false;
    const effectId = ++requestRef.current;
    let callId = 0;

    const load = async () => {
      const current = ++callId;
      const session = await authAdapter.getSession();
      if (
        cancelled ||
        effectId !== requestRef.current ||
        current !== callId
      ) {
        return;
      }

      if (!session.ok) {
        // A transport failure is not proof of sign-out. Keep the last known
        // state; an explicit 401 does mean the session is gone.
        if (session.status === 401) {
          setUser(null);
          setCredits({ available: null, status: "error" });
        }
        return;
      }

      if (session.data === null) {
        setUser(null);
        setCredits({ available: null, status: "ready" });
        return;
      }

      setUser(session.data.user);
      setCredits((previous) => ({
        available: previous.available,
        status: "loading",
      }));

      const wallet = await creditsAdapter.getWallet();
      if (
        cancelled ||
        effectId !== requestRef.current ||
        current !== callId
      ) {
        return;
      }

      if (!wallet.ok) {
        if (wallet.status === 401) {
          setUser(null);
        }
        setCredits({ available: null, status: "error" });
        return;
      }

      setCredits({
        available: Math.max(
          0,
          wallet.data.credits - (wallet.data.reserved ?? 0)
        ),
        status: "ready",
      });
    };

    void load();

    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile panel after any successful route change (including a
  // language switch) and release the document listeners when it closes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route completion is an external event
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A language dropdown inside the panel owns the first Escape press.
      if (mobilePanelRef.current?.querySelector('[role="menu"]')) return;
      setMobileOpen(false);
      mobileButtonRef.current?.focus();
    };
    const onOutside = (event: Event) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onOutside);
    };
  }, [mobileOpen]);

  const navLinks: NavLink[] = [
    { label: t("explore"), href: "/wallpapers" },
    { label: t("studio"), href: "/studio" },
    { label: t("community"), href: "/community" },
    ...(user ? [{ label: t("myCreations"), href: "/my-creations" }] : []),
  ];

  const creditsDisplay =
    credits.available !== null
      ? new Intl.NumberFormat(locale).format(credits.available)
      : credits.status === "loading"
        ? "…"
        : "—";
  const creditsLabel =
    credits.status === "loading"
      ? t("creditsLoading")
      : credits.status === "error"
        ? t("creditsUnavailable")
        : `${t("creditsBalance")}: ${creditsDisplay}`;
  const userLabel =
    user?.displayName?.trim() || user?.email || t("userFallback");

  const signOut = async (): Promise<boolean> => {
    if (signingOut) return false;
    setSigningOut(true);
    setSignOutFailed(false);
    try {
      const result = await authAdapter.signOut();
      if (!result.ok) {
        setSignOutFailed(true);
        return false;
      }
      requestRef.current += 1;
      setUser(null);
      setCredits({ available: null, status: "ready" });
      setMobileOpen(false);
      router.refresh();
      return true;
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header
      ref={headerRef}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || mobileOpen
          ? "border-b border-white/10 bg-[#050308]/90 backdrop-blur-xl"
          : "border-b border-transparent bg-gradient-to-b from-black/65 via-black/20 to-transparent"
      }`}
    >
      <div
        className={`relative mx-auto flex h-16 w-full items-center px-5 sm:px-6 md:h-20 ${maxWidthClassName}`}
      >
        <Link
          href="/"
          aria-label="WallHaze"
          onClick={() => setMobileOpen(false)}
          className="-ml-2 flex items-center rounded-lg px-2 py-2 text-lg font-semibold tracking-tight outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-violet-400/70 md:text-xl"
        >
          Wall
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Haze
          </span>
        </Link>

        <nav
          className="absolute left-1/2 hidden min-w-0 -translate-x-1/2 items-center justify-center gap-1 xl:flex"
          aria-label={t("mainAria")}
        >
          {navLinks.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-full px-3.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
                  active
                    ? "bg-white/[0.08] text-white"
                    : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {link.label}
                {active ? <ActiveDot /> : null}
              </Link>
            );
          })}
        </nav>

        <div
          data-testid="header-desktop-actions"
          className="ml-auto hidden items-center justify-end gap-2.5 xl:flex"
        >
          <LanguageSwitcher />
          {user ? (
            <>
              <CreditsChip
                availableCredits={credits.available}
                status={credits.status}
                display={creditsDisplay}
                label={creditsLabel}
                active={creditsActive}
              />
              <AccountMenu
                user={user}
                availableCredits={credits.available}
                creditsStatus={credits.status}
                onSignOut={signOut}
              />
            </>
          ) : (
            <>
              <Link
                href={loginHref(pathname)}
                className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-zinc-200 outline-none transition hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/70"
              >
                {t("signIn")}
              </Link>
              {!isStudio ? (
                <Button href="/studio" className="whitespace-nowrap">
                  {t("getStarted")}
                </Button>
              ) : null}
            </>
          )}
        </div>

        <div
          data-testid="header-mobile-actions"
          className="ml-auto flex items-center justify-end gap-1.5 xl:hidden"
        >
          {user ? (
            <span className="hidden sm:inline-flex">
              <CreditsChip
                availableCredits={credits.available}
                status={credits.status}
                display={creditsDisplay}
                label={creditsLabel}
                compact
                active={creditsActive}
              />
            </span>
          ) : null}
          {!isStudio ? (
            <Button
              href="/studio"
              size="sm"
              className="h-11 whitespace-nowrap px-4 text-xs"
            >
              {t("getStarted")}
            </Button>
          ) : null}
          <button
            ref={mobileButtonRef}
            type="button"
            aria-label={mobileOpen ? t("closeMenu") : t("openMenu")}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={(event) => {
              const next = !mobileOpen;
              setMobileOpen(next);
              if (next && event.detail === 0) {
                window.setTimeout(
                  () =>
                    mobilePanelRef.current
                      ?.querySelector<HTMLElement>("a, button")
                      ?.focus(),
                  0
                );
              }
            }}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-zinc-200 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/70"
          >
            <MenuIcon open={mobileOpen} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="mobile-navigation"
          ref={mobilePanelRef}
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-white/10 bg-[#050308]/95 backdrop-blur-xl md:max-h-[calc(100dvh-5rem)] xl:hidden"
        >
          <div
            className={`mx-auto px-5 pb-7 pt-3 sm:px-6 ${maxWidthClassName}`}
          >
            <div className="mb-3 flex items-center border-b border-white/10 pb-3">
              <LanguageSwitcher
                triggerClassName="min-h-11 px-3.5 text-sm"
                onSwitch={() => setMobileOpen(false)}
              />
            </div>
            <nav
              aria-label={t("mobileAria")}
              className="flex flex-col gap-0.5"
            >
              {navLinks.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`flex min-h-12 items-center justify-between rounded-xl px-3 text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
                      active
                        ? "bg-white/[0.07] font-medium text-white"
                        : "text-zinc-200 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>
                      {link.label}
                      {active ? <ActiveDot /> : null}
                    </span>
                  </Link>
                );
              })}
            </nav>

            {user ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    user={user}
                    className="h-10 w-10 text-sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {userLabel}
                    </p>
                    {user.displayName?.trim() && user.email ? (
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {user.email}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 border-t border-white/10 pt-2">
                  <Link
                    href="/credits"
                    onClick={() => setMobileOpen(false)}
                    aria-current={creditsActive ? "page" : undefined}
                    aria-label={creditsLabel}
                    className={`flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
                      creditsActive
                        ? "bg-violet-500/10 text-white"
                        : "text-zinc-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>{t("creditsBilling")}</span>
                    <span
                      aria-hidden
                      className="text-xs tabular-nums text-zinc-500"
                    >
                      {creditsDisplay}
                    </span>
                  </Link>
                  <Link
                    href="/account"
                    onClick={() => setMobileOpen(false)}
                    aria-current={pathname === "/account" ? "page" : undefined}
                    className={`flex min-h-11 items-center rounded-lg px-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
                      pathname === "/account"
                        ? "bg-violet-500/10 text-white"
                        : "text-zinc-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {t("myAccount")}
                  </Link>
                  <Link
                    href="/account/settings"
                    onClick={() => setMobileOpen(false)}
                    aria-current={
                      pathname.startsWith("/account/settings")
                        ? "page"
                        : undefined
                    }
                    className={`flex min-h-11 items-center rounded-lg px-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
                      pathname.startsWith("/account/settings")
                        ? "bg-violet-500/10 text-white"
                        : "text-zinc-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {t("accountSettings")}
                  </Link>

                  {signOutFailed ? (
                    <p
                      role="alert"
                      className="px-2 pb-1 pt-2 text-xs leading-relaxed text-amber-300"
                    >
                      {t("signOutFailed")}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={signingOut}
                    aria-busy={signingOut || undefined}
                    onClick={() => void signOut()}
                    className="mt-1 flex min-h-11 w-full items-center rounded-lg px-2 text-left text-sm text-red-300 outline-none transition hover:bg-red-500/10 hover:text-red-200 focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:cursor-wait disabled:opacity-60"
                  >
                    {signingOut ? t("signingOut") : t("logOut")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-2.5 border-t border-white/10 pt-4">
                <Link
                  href={loginHref(pathname)}
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-11 items-center justify-center rounded-full border border-white/15 px-4 text-sm font-medium text-zinc-100 outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-violet-400/70"
                >
                  {t("signIn")}
                </Link>
                {!isStudio ? (
                  <Button
                    href="/studio"
                    className="min-h-11 w-full"
                    onClick={() => setMobileOpen(false)}
                  >
                    {t("getStarted")}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
