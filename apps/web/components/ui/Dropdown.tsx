"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface DropdownProps {
  /** Accessible name for the trigger button. */
  triggerLabel: string;
  /** Accessible name for the menu. */
  menuLabel: string;
  /** Content rendered inside the trigger button (icon, text, chevron). */
  trigger: ReactNode;
  /** Trigger classes; the chevron rotation is driven by `open`. */
  triggerClassName?: string;
  /** Menu panel classes (position + size). */
  menuClassName?: string;
  /**
   * Menu content. Receives `close` so items can dismiss after acting;
   * keyboard close returns focus to the trigger automatically.
   */
  children: (close: () => void) => ReactNode;
}

/**
 * Generic popover menu: outside-press + Escape closing (with focus restore)
 * around a fully custom trigger and menu body. LanguageSwitcher and any
 * future account menus build on this instead of re-implementing the plumbing.
 */
export default function Dropdown({
  triggerLabel,
  menuLabel,
  trigger,
  triggerClassName = "",
  menuClassName = "",
  children,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);

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
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((value) => !value)}
        className={`outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${triggerClassName}`}
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={menuLabel}
          className={`animate-rise-in absolute left-0 z-50 mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#0a0710]/95 py-1 shadow-2xl shadow-black/60 backdrop-blur-xl ${menuClassName}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
