"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { loginHref } from "@/lib/auth/return-to";

function InfoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M12 11.5V16" />
    </svg>
  );
}

export type CreditsNoticeState =
  | "loading"
  | "unavailable"
  | "signed-out"
  | "ready"
  | "insufficient"
  | "in-flight";

interface CreditsNoticeProps {
  state: CreditsNoticeState;
  priceCredits: number | null;
  balance: number | null;
  className?: string;
}

/**
 * Live credits notice. It mirrors the real auth/pricing/wallet state:
 * blocked states point at the action (sign in / top up), the ready state
 * shows the server price and balance, and an in-flight generation reports
 * the reservation instead of repeating "Credits required".
 */
export default function CreditsNotice({
  state,
  priceCredits,
  balance,
  className = "",
}: CreditsNoticeProps) {
  const t = useTranslations("credits");

  const tone =
    state === "ready"
      ? { box: "border-violet-400/25 bg-violet-500/5", icon: "text-violet-300", title: "text-violet-100", body: "text-violet-100/70" }
      : state === "in-flight"
        ? { box: "border-white/10 bg-white/[0.03]", icon: "text-zinc-300", title: "text-zinc-100", body: "text-zinc-400" }
        : { box: "border-amber-400/20 bg-amber-400/5", icon: "text-amber-300", title: "text-amber-200", body: "text-amber-100/70" };

  let title = t("title");
  let body = t("notice");
  let action: { href: string; label: string } | null = null;

  if (state === "loading") {
    title = t("title");
    body = t("loadingNotice");
  } else if (state === "unavailable") {
    body = t("unavailableNotice");
  } else if (state === "signed-out") {
    body = t("signedOutBody");
    action = { href: loginHref("/studio"), label: t("signInAction") };
  } else if (state === "ready" && priceCredits !== null) {
    title = t("perGeneration", { credits: priceCredits });
    body = t("balanceLine", {
      credits: balance ?? 0,
      price: priceCredits,
    });
  } else if (state === "insufficient" && priceCredits !== null) {
    title = t("insufficientTitle");
    body = t("insufficientBody", {
      need: priceCredits,
      have: balance ?? 0,
    });
    action = { href: "/credits", label: t("openCredits") };
  } else if (state === "in-flight") {
    title = t("inFlightTitle");
    body = t("inFlightBody", { credits: priceCredits ?? 0 });
  }

  return (
    <aside
      className={`flex items-start gap-3 rounded-xl border p-3.5 ${tone.box} ${className}`}
      data-testid="credits-notice"
      data-state={state}
    >
      <InfoIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon}`} />
      <div>
        <p className={`text-sm font-medium ${tone.title}`}>{title}</p>
        <p className={`mt-1 text-xs leading-relaxed ${tone.body}`}>{body}</p>
        {action ? (
          <Link
            href={action.href}
            className="mt-1.5 inline-block text-xs font-medium text-violet-300 underline-offset-4 hover:underline"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
