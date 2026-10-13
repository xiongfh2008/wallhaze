function DeviceIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

function StylesIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 2 8.5 4.5L12 11 3.5 6.5 12 2z" />
      <path d="m3.5 11.5 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
    </svg>
  );
}

function QualityIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

const REASONS = [
  {
    Icon: DeviceIcon,
    title: "Made for Your Device",
    body: "Every wallpaper is crafted to fit phones, tablets and desktops — sharp edge to edge on any screen.",
  },
  {
    Icon: StylesIcon,
    title: "Explore Unique Styles",
    body: "From anime to surreal dreamscapes, discover looks you won’t find in any stock library.",
  },
  {
    Icon: QualityIcon,
    title: "High-Quality Wallpapers",
    body: "High-resolution renders with rich color and detail, tuned to make every pixel count.",
  },
];

export default function WhySection() {
  return (
    <section id="why" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-14 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300">
            Why WallHaze
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
            Built for beautiful screens
          </h2>
        </div>

        <div className="grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/10">
          {REASONS.map(({ Icon, title, body }) => (
            <div key={title} className="md:px-10 md:first:pl-0 md:last:pr-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-300">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
