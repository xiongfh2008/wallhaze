"use client";

import { useEffect, useState } from "react";
import PlaceholderLink from "./PlaceholderLink";

const NAV_LINKS = [
  { label: "Explore", href: "#explore" },
  { label: "AI Generator", href: "#generator" },
  { label: "Styles", href: "#styles" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open
          ? "border-b border-white/10 bg-[#050308]/80 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 md:h-20">
        <a
          href="#top"
          className="text-lg font-semibold tracking-tight"
          onClick={() => setOpen(false)}
        >
          Wall
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Haze
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <PlaceholderLink className="rounded-full px-4 py-2 text-sm text-zinc-300 transition-colors hover:text-white">
            Sign in
          </PlaceholderLink>
          <a
            href="#generator"
            className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2 text-sm font-semibold shadow-lg shadow-violet-950/50 transition hover:brightness-110"
          >
            Get Started
          </a>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/5 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div className="animate-rise-in border-t border-white/10 bg-[#050308]/95 px-6 py-6 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-3 text-base text-zinc-200 transition hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4">
            <PlaceholderLink className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm text-zinc-200">
              Sign in
            </PlaceholderLink>
            <a
              href="#generator"
              className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-center text-sm font-semibold"
              onClick={() => setOpen(false)}
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
