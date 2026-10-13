import { HERO_IMAGE } from "@/lib/styles";
import WallpaperImage from "./WallpaperImage";

export default function Hero() {
  return (
    <section id="top" className="relative flex min-h-[100svh] items-center overflow-hidden">
      <div className="absolute inset-0">
        <WallpaperImage
          src={HERO_IMAGE}
          alt=""
          gradient="from-violet-950 via-purple-950 to-black"
          eager
          className="animate-hero-zoom h-full w-full object-cover"
        />
        {/* Calm areas for text: darken left column and blend into the page below. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-[#050308]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-36 md:pb-32">
        <p
          className="animate-fade-up mb-6 inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.25em] text-violet-300"
          style={{ animationDelay: "100ms" }}
        >
          <span className="h-px w-8 bg-gradient-to-r from-violet-400 to-transparent" />
          AI Wallpaper Studio
        </p>

        <h1
          className="animate-fade-up max-w-3xl text-5xl font-semibold leading-[1.04] tracking-tight md:text-7xl"
          style={{ animationDelay: "220ms" }}
        >
          Your Screen.
          <br />
          <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent">
            Your World.
          </span>
        </h1>

        <p
          className="animate-fade-up mt-6 max-w-xl text-lg leading-relaxed text-zinc-300"
          style={{ animationDelay: "360ms" }}
        >
          Create stunning AI wallpapers made for your device.
        </p>

        <div
          className="animate-fade-up mt-10 flex flex-wrap items-center gap-4"
          style={{ animationDelay: "500ms" }}
        >
          <a
            href="#generator"
            className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-3.5 text-sm font-semibold shadow-xl shadow-violet-950/50 transition hover:brightness-110 active:scale-[0.98]"
          >
            Create Wallpaper
          </a>
          <a
            href="#styles"
            className="rounded-full border border-white/20 bg-white/5 px-8 py-3.5 text-sm font-medium text-zinc-100 backdrop-blur transition hover:border-white/35 hover:bg-white/10 active:scale-[0.98]"
          >
            Explore Gallery
          </a>
        </div>

        <p
          className="animate-fade-up mt-10 text-sm text-zinc-500"
          style={{ animationDelay: "640ms" }}
        >
          Free during early preview · No sign-up required · Phone, tablet &amp; desktop
        </p>
      </div>
    </section>
  );
}
