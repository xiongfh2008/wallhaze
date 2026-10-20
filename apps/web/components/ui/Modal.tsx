"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible dialog name (title or image alt). */
  label: string;
  children: ReactNode;
  /** Extra classes for the inner panel (width/height constraints). */
  panelClassName?: string;
  /** When false the backdrop click does not close (destructive dialogs). */
  closeOnBackdrop?: boolean;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Base modal shell: fixed overlay, scroll lock, Escape-to-close, backdrop
 * click and a focus trap. Every dialog in the app (lightbox, confirm
 * dialogs) builds on this so keyboard behavior stays consistent.
 */
export default function Modal({
  open,
  onClose,
  label,
  children,
  panelClassName = "",
  closeOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Scroll lock + initial focus + Escape. Runs on open only; the cleanup
  // restores the exact previous overflow so nested overlays stack safely.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTarget =
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      panelRef.current;
    focusTarget?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  // Minimal focus trap: Tab / Shift+Tab cycle inside the panel so keyboard
  // users can never land behind the overlay.
  const trapFocus = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    []
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm md:p-8"
      onClick={closeOnBackdrop ? onClose : undefined}
      onKeyDown={trapFocus}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={`animate-rise-in relative outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
