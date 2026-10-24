import { useTranslations } from "next-intl";
import { DEMO_SAMPLE_IMAGE } from "@/lib/styles";
import Button from "./ui/Button";
import WallpaperImage from "./WallpaperImage";

function SparkleIcon() {
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
      <path d="M12 3v4m0 10v4m-9-9h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8" />
    </svg>
  );
}

function DeviceIcon() {
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
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10.5 5.5h3" />
    </svg>
  );
}

function ImageIcon() {
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
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m3.5 17.5 4.5-4.5 3.5 3.5 4-4 5 5" />
    </svg>
  );
}

/**
 * "AI Studio" homepage block: what the Studio does, shown between the style
 * entries and the how-it-works steps. Server-rendered — no client JS. The
 * copy describes capabilities (styles, sizes, reference image) exactly like
 * the rest of the homepage; availability gating stays inside the Studio.
 */
export default function StudioIntro() {
  const t = useTranslations("studioIntro");

  const FEATURES = [
    { icon: <SparkleIcon />, title: t("feature1Title"), body: t("feature1Body") },
    { icon: <DeviceIcon />, title: t("feature2Title"), body: t("feature2Body") },
    { icon: <ImageIcon />, title: t("feature3Title"), body: t("feature3Body") },
  ];

  return (
    <section id="studio" className="relative py-16 md:py-20">
      {/* Ambient glow behind the visual column. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-1/2 hidden h-96 w-96 -translate-y-1/2 rounded-full bg-violet-600/15 blur-[120px] lg:block"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-2 lg:gap-14">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            {t("eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-zinc-400">
            {t("body")}
          </p>

          <ul className="mt-8 space-y-5">
            {FEATURES.map(({ icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-300"
                >
                  {icon}
                </span>
                <div>
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <Button href="/studio" size="lg" className="mt-8">
            {t("cta")}
          </Button>
        </div>

        {/* Phone-frame preview of a studio result — decorative, same image
            language as the rest of the homepage. */}
        <div className="relative mx-auto w-full max-w-[260px] lg:max-w-[300px]">
          <div className="rounded-[2.5rem] border border-white/10 bg-black/40 p-2.5 shadow-2xl shadow-black/60">
            <div className="aspect-[9/16] overflow-hidden rounded-[2rem]">
              <WallpaperImage
                src={DEMO_SAMPLE_IMAGE}
                alt={t("visualAlt")}
                gradient="from-violet-950 via-purple-950 to-black"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-b from-violet-600/20 to-fuchsia-600/10 blur-2xl"
          />
        </div>
      </div>
    </section>
  );
}
