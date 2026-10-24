"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { AuthUser } from "@/lib/api/auth";
import UserAvatar from "./UserAvatar";

export type CreditsStatus = "loading" | "ready" | "error";

interface AccountMenuProps {
  user: AuthUser;
  /** Spendable Credits from the backend; null while loading/unavailable. */
  availableCredits: number | null;
  creditsStatus: CreditsStatus;
  /** Resolves true only after the server session was actually revoked. */
  onSignOut: () => Promise<boolean>;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${
        open ? "rotate-180" : ""
      }`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Signed-in avatar menu: real account destinations, the backend balance and
 * an explicit log-out action. Opens as an accessible menu (Escape, arrows,
 * Home/End, outside press) and never invents an account state.
 */
export default function AccountMenu({
  user,
  availableCredits,
  creditsStatus,
  onSignOut,
}: AccountMenuProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusFirstRef = useRef(false);

  const label = user.displayName?.trim() || user.email || t("userFallback");
  const creditsDisplay =
    availableCredits !== null
      ? new Intl.NumberFormat(locale).format(availableCredits)
      : creditsStatus === "loading"
        ? "…"
        : "—";

  const myAccountActive = pathname === "/account";
  const settingsActive = pathname.startsWith("/account/settings");
  const creditsActive = pathname.startsWith("/credits");

  const close = () => setOpen(false);

  const menuItems = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );

  useEffect(() => {
    if (!open) return;

    const focusTimer = focusFirstRef.current
      ? window.setTimeout(() => menuItems()[0]?.focus(), 0)
      : null;
    const onOutside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = menuItems();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next =
        current === -1
          ? delta === 1
            ? 0
            : items.length - 1
          : (current + delta + items.length) % items.length;
      items[next]?.focus();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const ok = await onSignOut();
      if (!ok) {
        setFailed(true);
        return;
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("accountMenu")}: ${label}`}
        onClick={(event) => {
          setFailed(false);
          // Keyboard/SR activation enters the menu; a pointer click leaves
          // focus on the trigger and avoids a misleading "selected" row.
          focusFirstRef.current = event.detail === 0;
          setOpen((value) => !value);
        }}
        className="flex h-10 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] pl-1 pr-2.5 outline-none transition hover:border-white/25 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-violet-400/70"
      >
        <UserAvatar user={user} className="h-8 w-8 text-xs" />
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("accountMenu")}
          onKeyDown={onMenuKeyDown}
          className="animate-rise-in absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0710]/95 shadow-2xl shadow-black/70 backdrop-blur-xl"
        >
          <div className="border-b border-white/10 px-4 py-3.5">
            <p className="truncate text-sm font-medium text-white">{label}</p>
            {user.email && user.displayName?.trim() ? (
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {user.email}
              </p>
            ) : null}
          </div>

          <div className="p-1.5">
            <Link
              href="/account"
              role="menuitem"
              tabIndex={-1}
              aria-current={myAccountActive ? "page" : undefined}
              onClick={close}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition hover:bg-white/5 hover:text-white focus-visible:bg-white/10 focus-visible:text-white ${
                myAccountActive
                  ? "bg-violet-500/10 text-white"
                  : "text-zinc-300"
              }`}
            >
              {t("myAccount")}
            </Link>
            <Link
              href="/account/settings"
              role="menuitem"
              tabIndex={-1}
              aria-current={settingsActive ? "page" : undefined}
              onClick={close}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition hover:bg-white/5 hover:text-white focus-visible:bg-white/10 focus-visible:text-white ${
                settingsActive
                  ? "bg-violet-500/10 text-white"
                  : "text-zinc-300"
              }`}
            >
              {t("accountSettings")}
            </Link>
            <Link
              href="/credits"
              role="menuitem"
              tabIndex={-1}
              aria-current={creditsActive ? "page" : undefined}
              onClick={close}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition hover:bg-white/5 hover:text-white focus-visible:bg-white/10 focus-visible:text-white ${
                creditsActive
                  ? "bg-violet-500/10 text-white"
                  : "text-zinc-300"
              }`}
            >
              <span>{t("creditsBilling")}</span>
              <span
                className="shrink-0 text-xs tabular-nums text-zinc-500"
                aria-hidden
              >
                {creditsDisplay}
              </span>
            </Link>

            <div className="my-1.5 h-px bg-white/10" />

            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={busy}
              aria-busy={busy || undefined}
              onClick={() => void signOut()}
              className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm text-zinc-300 outline-none transition hover:bg-red-500/10 hover:text-red-200 focus-visible:bg-red-500/10 focus-visible:text-red-200 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? t("signingOut") : t("logOut")}
            </button>

            {failed ? (
              <p
                role="alert"
                className="px-3 pb-1 pt-2 text-xs leading-relaxed text-amber-300"
              >
                {t("signOutFailed")}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
