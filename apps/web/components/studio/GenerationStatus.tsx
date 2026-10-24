"use client";

import { useTranslations } from "next-intl";
import { generationErrorCopy } from "@/lib/studio/error-copy";
import type { GenerateOutcome } from "@/lib/api/generation";
import Spinner from "../ui/Spinner";

interface GenerationStatusProps {
  /** Visible generation state — see the Studio state machine. */
  phase:
    | "idle"
    | "validating"
    | "submitting"
    | "generating"
    | "blocked"
    | "failed"
    | "canceled"
    | "timed_out";
  /** Typed failure outcome, when the phase is failed/canceled/timed_out. */
  failureOutcome?: Extract<GenerateOutcome, { ok: false }> | null;
  /** Honest "still working" escalation after ~15s of generating. */
  longWait?: boolean;
  className?: string;
}

/**
 * Generation status line (FE04-A).
 *
 * Renders the non-idle phases of the Studio state machine with honest copy:
 * generating shows a spinner and NEVER a fabricated percentage or server
 * stage (the current sync endpoint exposes no progress); canceled reports
 * the user's abort without promising anything about future billing;
 * timed_out and failed branch on typed reasons / stable error codes, with
 * the server's Retry-After displayed verbatim when present.
 */
export default function GenerationStatus({
  phase,
  failureOutcome = null,
  longWait = false,
  className = "",
}: GenerationStatusProps) {
  const t = useTranslations("generator");

  if (phase === "idle") return null;

  if (phase === "validating" || phase === "submitting" || phase === "generating") {
    return (
      <div
        role="status"
        className={`flex items-start gap-3 rounded-xl border border-violet-400/25 bg-violet-500/10 p-3.5 ${className}`}
        data-testid="generation-status"
      >
        <Spinner className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
        <div>
          <p className="text-sm font-medium text-violet-100">
            {t("statusGenerating")}
          </p>
          {longWait && (
            <p className="mt-1 text-xs leading-relaxed text-violet-200/70">
              {t("statusLongWait")}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (phase === "blocked") {
    return (
      <div
        role="status"
        className={`rounded-xl border border-amber-400/25 bg-amber-400/5 p-3.5 ${className}`}
        data-testid="generation-status"
      >
        <p className="text-sm font-medium text-amber-200">
          {t("statusBlockedTitle")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
          {t("statusBlockedNotice")}
        </p>
      </div>
    );
  }

  // failed / canceled / timed_out — copy resolved from the typed outcome.
  const copy = failureOutcome
    ? generationErrorCopy(failureOutcome)
    : { key: "generateFailed" as const };
  const isErrorTone = phase === "failed";

  return (
    <div
      role="alert"
      className={`rounded-xl border p-3.5 ${
        isErrorTone
          ? "border-red-400/25 bg-red-500/10"
          : "border-zinc-500/25 bg-zinc-500/10"
      } ${className}`}
      data-testid="generation-status"
    >
      <p
        className={`text-sm font-medium ${
          isErrorTone ? "text-red-200" : "text-zinc-200"
        }`}
      >
        {t(copy.key, copy.values ?? {})}
      </p>
    </div>
  );
}
