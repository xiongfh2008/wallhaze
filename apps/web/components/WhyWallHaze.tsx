import { useTranslations } from "next-intl";

function RatioIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5"
    >
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M6.5 8.5v7m11-7v7" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5"
    >
      <path d="M12 20s-7.5-4.6-9.3-9.4C1.5 7.5 3.6 4.5 6.8 4.5c2 0 3.6 1.1 4.4 2.7l.8 1.5.8-1.5c.8-1.6 2.4-2.7 4.4-2.7 3.2 0 5.3 3 4.1 6.1C19.5 15.4 12 20 12 20Z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" />
    </svg>
  );
}

/**
 * "Why WallHaze" homepage block — three factual differentiators in a
 * text-led band (deliberately not another card grid). The old fourth
 * "honest by design" point is merged into the gallery description to avoid
 * repeating the same value twice. Server-rendered.
 */
export default function WhyWallHaze() {
  const t = useTranslations("why");

  const REASONS = [
    { icon: <RatioIcon />, title: t("item1Title"), body: t("item1Body") },
    { icon: <HeartIcon />, title: t("item2Title"), body: t("item2Body") },
    { icon: <GlobeIcon />, title: t("item4Title"), body: t("item4Body") },
  ];

  return (
    <section id="why" className="relative py-12 md:py-14">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            {t("eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {t("title")}
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-3 md:gap-10">
          {REASONS.map(({ icon, title, body }) => (
            <div
              key={title}
              className="border-t border-white/10 pt-6"
            >
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-300"
              >
                {icon}
              </span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
