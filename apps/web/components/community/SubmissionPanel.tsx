"use client";

import { useTranslations } from "next-intl";
import CopyEmailButton from "./CopyEmailButton";
import {
  COMMUNITY_EMAIL,
  COMMUNITY_SUBMISSION_BODY,
  COMMUNITY_SUBMISSION_SUBJECT,
  submissionMailto,
} from "@/lib/community";

/**
 * Email-only submission instructions. There is intentionally no form, no
 * file input, no upload endpoint and no success state: a mailto link only
 * opens the visitor's own mail client.
 */
export default function SubmissionPanel() {
  const t = useTranslations("community.submit");
  return (
    <section
      id="submit"
      aria-labelledby="submit-heading"
      className="scroll-mt-24 border-t border-white/10 py-16 md:py-20"
    >
      <div className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/35 via-black to-black p-6 md:p-10">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
          {t("eyebrow")}
        </p>
        <h2
          id="submit-heading"
          className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl"
        >
          {t("title")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">
          {t("subtitle")}
        </p>

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t("emailLabel")}
            </p>
            <code className="mt-2 block select-all break-all rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-violet-100">
              {COMMUNITY_EMAIL}
            </code>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={submissionMailto()}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white outline-none transition hover:from-violet-500 hover:to-fuchsia-500 focus-visible:ring-2 focus-visible:ring-violet-300/80"
              >
                {t("openEmail")}
              </a>
              <CopyEmailButton
                email={COMMUNITY_EMAIL}
                label={t("copyEmail")}
                copiedLabel={t("copied")}
                failedLabel={t("copyFailed")}
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              {t("noClient")}
            </p>
            <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-950/15 px-3 py-2 text-xs leading-relaxed text-amber-200/85">
              {t("mailtoNote")}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t("subjectLabel")}
            </p>
            <p className="mt-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200">
              {COMMUNITY_SUBMISSION_SUBJECT}
            </p>
            <p className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t("templateTitle")}
            </p>
            <pre className="mt-2 max-h-[22rem] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-zinc-300 [scrollbar-width:thin]">
              {COMMUNITY_SUBMISSION_BODY}
            </pre>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              {t("templateNote")}
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6">
          <h3 className="text-sm font-semibold text-zinc-100">
            {t("noticesTitle")}
          </h3>
          <ul className="mt-3 grid gap-2 text-xs leading-relaxed text-zinc-400 md:grid-cols-2">
            {[
              "notice1",
              "notice2",
              "notice3",
              "notice4",
              "notice5",
              "notice6",
            ].map((key) => (
              <li key={key} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-300" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
