"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LANGUAGE_SWITCH_FLAG } from "@/lib/language-bridge";
import Dropdown from "./ui/Dropdown";

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
 * Compact locale dropdown built on the shared Dropdown primitive: a globe +
 * current-language trigger that opens a vertical menu of every supported
 * language (natural self-names, no flags). Left-anchored so it stays inside
 * the viewport in the desktop header and the mobile panel alike.
 */
export default function LanguageSwitcher({
  className = "",
  triggerClassName,
  onSwitch,
}: {
  className?: string;
  /** Override the trigger padding when it needs a larger touch target. */
  triggerClassName?: string;
  /** Called before navigation (e.g. to close the mobile panel). */
  onSwitch?: () => void;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const tLabel = useTranslations("languageSwitcher");

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
      onSwitch?.();
      router.replace(pathname, { locale: next });
    }
  };

  return (
    <div className={className}>
      <Dropdown
        triggerLabel={tLabel("aria")}
        menuLabel={tLabel("label")}
        menuClassName="w-44"
        trigger={
          <span className="flex items-center gap-1.5">
            <GlobeIcon className="h-4 w-4" />
            <span>{tLabel(locale)}</span>
            <ChevronIcon className="h-3.5 w-3.5" />
          </span>
        }
        triggerClassName={`flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 font-medium text-zinc-300 transition hover:border-white/25 hover:text-white ${
          triggerClassName ?? "px-3 py-1.5 text-xs"
        }`}
      >
        {(close) => (
          <>
            {routing.locales.map((id) => {
              const active = id === locale;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    switchTo(id);
                    close();
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm outline-none transition focus-visible:bg-white/10 ${
                    active
                      ? "bg-violet-500/15 text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className={active ? "font-medium" : undefined}>
                    {tLabel(id)}
                  </span>
                  {active && (
                    <CheckIcon className="h-4 w-4 shrink-0 text-violet-300" />
                  )}
                </button>
              );
            })}
          </>
        )}
      </Dropdown>
    </div>
  );
}
