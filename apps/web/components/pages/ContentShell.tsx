import type { ReactNode } from "react";

interface ContentShellProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * Shared shell for the FE09 content pages — consistent eyebrow, heading,
 * spacing and long-form reading rhythm for the legal pages (privacy/terms).
 */
export default function ContentShell({
  eyebrow,
  title,
  subtitle,
  children,
}: ContentShellProps) {
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

      <div className="mt-8">{children}</div>
    </main>
  );
}
