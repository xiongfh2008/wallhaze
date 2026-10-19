import { useTranslations } from "next-intl";
import FooterYear from "./FooterYear";
import PlaceholderLink from "./PlaceholderLink";

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z"
      />
    </svg>
  );
}

function InstagramIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function YoutubeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="currentColor" />
    </svg>
  );
}

export default function Footer() {
  const t = useTranslations("footer");
  const tCommon = useTranslations("common");

  const COLUMNS = [
    {
      title: t("explore"),
      links: [
        { label: t("trending"), href: "#explore" },
        { label: t("popularStyles"), href: "#styles" },
        { label: t("why"), href: "#why" },
      ],
    },
    {
      title: t("generator"),
      links: [
        { label: t("aiGenerator"), href: "#generator" },
        { label: t("allStyles"), href: "#generator" },
      ],
    },
    {
      title: t("company"),
      links: [
        { label: t("privacy"), href: null },
        { label: t("terms"), href: null },
        { label: t("contact"), href: null },
      ],
    },
  ];

  const SOCIALS = [
    { label: t("socialX"), Icon: XIcon },
    { label: t("socialInstagram"), Icon: InstagramIcon },
    { label: t("socialYoutube"), Icon: YoutubeIcon },
  ];

  return (
    <footer className="border-t border-white/10 bg-black/60">
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <a href="#top" className="text-lg font-semibold tracking-tight">
              Wall
              <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                Haze
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-500">
              {t("tagline")}
            </p>
            <div className="mt-6 flex gap-3">
              {SOCIALS.map(({ label, Icon }) => (
                <PlaceholderLink
                  key={label}
                  title={t("socialComingSoon", { label })}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/25 hover:text-white"
                >
                  <span className="sr-only">{label}</span>
                  <Icon className="h-4 w-4" />
                </PlaceholderLink>
              ))}
            </div>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h3 className="text-sm font-semibold text-zinc-200">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href ? (
                      <a
                        href={link.href}
                        className="text-sm text-zinc-400 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <PlaceholderLink
                        className="text-sm text-zinc-400 transition-colors hover:text-white"
                        title={tCommon("comingSoon")}
                      >
                        {link.label}
                      </PlaceholderLink>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-zinc-600 md:flex-row">
          <p>
            © <FooterYear /> {t("rights")}
          </p>
          <p>{t("madeFor")}</p>
        </div>
      </div>
    </footer>
  );
}
