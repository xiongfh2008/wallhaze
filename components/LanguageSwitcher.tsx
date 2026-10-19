"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LANGUAGE_SWITCH_FLAG } from "@/lib/language-bridge";

interface LanguageSwitcherProps {
  className?: string;
}

function GlobeIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9s1.4-6.4 3.9-9z" />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

/**
 * Compact locale dropdown: a globe + current-language trigger that opens a
 * vertical menu of every supported language (natural self-names, no flags).
 * The menu is left-anchored so it stays inside the viewport both in the
 * desktop header and in the mobile panel. Closes on selection, outside
 * pointer press and Escape (returning focus to the trigger).
 */
export default function LanguageSwitcher({
  className = "",
}: LanguageSwitcherProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const tLabel = useTranslations("languageSwitcher");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const switchTo = (next: (typeof routing.locales)[number]) => {
    if (next !== locale) {
      try {
        window.sessionStorage.setItem(
          LANGUAGE_SWITCH_FLAG,
          JSON.stringify({ target: next })
        );
      } catch {
        // Storage unavailable — the switch still happens, only the generator
        // state is not carried over.
      }
      router.replace(pathname, { locale: next });
    }
    setOpen(false);
  };

  // Close on outside presses and Escape; Escape restores focus to the
  // trigger so keyboard users never drop into a focus void. pointerdown,
  // mousedown AND click are all covered so programmatic/synthetic clicks
  // (which skip pointer events) still close the menu.
  useEffect(() => {
    if (!open) return;
    const onOutside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("click", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tLabel("aria")}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-zinc-300 outline-none transition hover:border-white/25 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/60"
      >
        <GlobeIcon className="h-4 w-4" />
        <span>{tLabel(locale)}</span>
        <ChevronIcon
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={tLabel("label")}
          className="animate-rise-in absolute left-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0a0710]/95 py-1 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          {routing.locales.map((id) => {
            const active = id === locale;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => switchTo(id)}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm outline-none transition focus-visible:bg-white/10 ${
                  active
                    ? "bg-violet-500/15 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className={active ? "font-medium" : undefined}>
                  {tLabel(id)}
                </span>
                {active && <CheckIcon className="h-4 w-4 shrink-0 text-violet-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
