"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import Button from "./ui/Button";
import PlaceholderLink from "./PlaceholderLink";

/**
 * Restricted entry for features that do not exist yet (My Creations,
 * Credits, sign-in). Renders as a real, labeled control that explains it is
 * coming soon — it never pretends the feature is available or that
 * sign-in/payment succeeded.
 */
function ComingSoonEntry({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  const tCommon = useTranslations("common");
  return (
    <PlaceholderLink
      className={className}
      title={tCommon("comingSoon")}
    >
      {label}
    </PlaceholderLink>
  );
}

export default function Header() {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const navLinks = [
    { label: t("explore"), href: "/wallpapers" },
    { label: t("studio"), href: "/studio" },
  ];

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
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-6 md:h-20">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight"
          onClick={() => setOpen(false)}
        >
          Wall
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Haze
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label={t("mainAria")}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <ComingSoonEntry label={t("myCreations")} className="text-sm text-zinc-500 transition-colors hover:text-zinc-300" />
          <ComingSoonEntry label={t("credits")} className="text-sm text-zinc-500 transition-colors hover:text-zinc-300" />
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          <ComingSoonEntry
            label={t("signIn")}
            className="rounded-full px-4 py-2 text-sm text-zinc-300 transition-colors hover:text-white"
          />
          <Button href="/studio">{t("getStarted")}</Button>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/5 md:hidden"
          aria-label={open ? t("closeMenu") : t("openMenu")}
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
          <nav className="flex flex-col gap-1" aria-label={t("mobileAria")}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-3 text-base text-zinc-200 transition hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <ComingSoonEntry
              label={t("myCreations")}
              className="rounded-lg px-3 py-3 text-base text-zinc-500"
            />
            <ComingSoonEntry
              label={t("credits")}
              className="rounded-lg px-3 py-3 text-base text-zinc-500"
            />
          </nav>
          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4">
            <LanguageSwitcher className="self-start" />
            <ComingSoonEntry
              label={t("signIn")}
              className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm text-zinc-200"
            />
            <Button href="/studio" className="w-full" onClick={() => setOpen(false)}>
              {t("getStarted")}
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
