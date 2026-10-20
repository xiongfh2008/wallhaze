import { useTranslations } from "next-intl";

function NumberBadge({ step }: { step: number }) {
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-lg font-semibold text-violet-300"
    >
      {step}
    </span>
  );
}

/**
 * "How it works": three honest steps — free gallery browsing/downloads,
 * AI generation in the Studio, then save & set. No free-generation or
 * sign-up promises.
 */
export default function HowItWorks() {
  const t = useTranslations("howItWorks");

  const STEPS = [
    { step: 1, title: t("step1Title"), body: t("step1Body") },
    { step: 2, title: t("step2Title"), body: t("step2Body") },
    { step: 3, title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <section id="how-it-works" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-14 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            {t("eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
            {t("title")}
          </h2>
        </div>

        <ol className="grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/10">
          {STEPS.map(({ step, title, body }) => (
            <li key={step} className="md:px-10 md:first:pl-0 md:last:pr-0">
              <NumberBadge step={step} />
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-zinc-400">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
