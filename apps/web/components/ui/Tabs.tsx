"use client";

import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
}

interface TabsProps {
  tabs: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Accessible tab list with roving tabindex and arrow-key navigation
 * (WAI-ARIA tabs pattern). Panels stay with the parent — this component
 * only owns the tab strip, so layouts remain free.
 */
export default function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  className = "",
}: TabsProps) {
  const tablistRef = useRef<HTMLDivElement>(null);

  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    if (index < 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(tabs[next].id);
    const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]'
    );
    buttons?.[next]?.focus();
  };

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={moveFocus}
      className={`flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1 ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
              active
                ? "bg-violet-500/25 text-white ring-1 ring-violet-400/50"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
