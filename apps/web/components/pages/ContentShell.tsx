import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

interface ContentShellProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /**
   * True for unreleased legal drafts (privacy/terms): renders the explicit
   * "pending legal review" badge and explanation. Combined with noindex in
   * the page metadata, an unreviewed draft can never rank or silently pose
   * as effective terms.
   */
  draft?: boolean;
}

/**
 * Shared shell for the FE09 content pages — consistent heading, spacing
 * and (for legal drafts) the pending-review notice.
 */
export default function ContentShell({
  eyebrow,
  title,
  subtitle,
  children,
  draft = false,
}: ContentShellProps) {
  const t = useTranslations("content");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-28 md:pt-32">
      <p className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
        <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-transparent" />
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-3 leading-relaxed text-zinc-400">{subtitle}</p>
      ) : null}

      {draft ? (
        <div
          role="note"
          className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4"
        >
          <p className="text-sm font-semibold text-amber-200">
            {t("draftNotice")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-200/90">
            {t("draftBody")}
          </p>
        </div>
      ) : null}

      <div className="mt-8">{children}</div>
    </main>
  );
}
