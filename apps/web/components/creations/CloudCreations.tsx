"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import WallpaperImage from "@/components/WallpaperImage";
import LiveVideoPlayer from "@/components/studio/LiveVideoPlayer";
import { authAdapter } from "@/lib/api/auth";
import { resolveApiUrl } from "@/lib/api/client";
import {
  CREATION_SERVICES_CONFIGURED,
  creationsAdapter,
  type CloudCreation,
} from "@/lib/api/creations";
import { downloadImage } from "@/lib/download";
import { findStyle } from "@/lib/styles";
import { formatExpiryDate, retentionDisplay } from "@/lib/retention";

type MediaFilter = "all" | "image" | "video";

function againHref(item: CloudCreation): string {
  const params = new URLSearchParams();
  if (item.mediaType === "video") params.set("media", "video");
  if (item.prompt) params.set("prompt", item.prompt.slice(0, 800));
  if (item.styleId) params.set("style", item.styleId);
  const query = params.toString();
  return `/studio${query ? `?${query}` : ""}`;
}

/**
 * Cloud creations (R07). Images and live-wallpaper videos are account-scoped
 * and clearly separated from the device-local history below. Every media URL
 * is the backend's short-lived signed URL; videos are never public gallery
 * entries and are never auto-published.
 */
export default function CloudCreations() {
  const t = useTranslations("creations");
  const tCommon = useTranslations("common");
  const tStyles = useTranslations("styleLabels");
  const locale = useLocale();
  const [items, setItems] = useState<CloudCreation[] | null>(null);
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [state, setState] = useState<"hidden" | "loading" | "ready" | "error">(
    CREATION_SERVICES_CONFIGURED ? "loading" : "hidden"
  );
  const [notice, setNotice] = useState<{
    tone: "success" | "warning";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!CREATION_SERVICES_CONFIGURED) return;
    let cancelled = false;
    void (async () => {
      const session = await authAdapter.getSession();
      if (cancelled) return;
      if (!session.ok || session.data === null) {
        setState("hidden");
        return;
      }
      const page = await creationsAdapter.listCreations();
      if (cancelled) return;
      if (!page.ok) {
        setState("error");
        return;
      }
      setItems(
        page.data.items
          .filter((item) => item.status === "succeeded")
          .map((item) => {
            const mediaType: "image" | "video" =
              item.mediaType ?? (item.imageUrl ? "image" : "video");
            return {
              ...item,
              mediaType,
              imageUrl: item.imageUrl
                ? resolveApiUrl(item.imageUrl) ?? item.imageUrl
                : null,
              videoUrl: item.videoUrl
                ? resolveApiUrl(item.videoUrl) ?? item.videoUrl
                : null,
              videoDownloadUrl: item.videoDownloadUrl
                ? resolveApiUrl(item.videoDownloadUrl) ?? item.videoDownloadUrl
                : null,
              posterUrl: item.posterUrl
                ? resolveApiUrl(item.posterUrl) ?? item.posterUrl
                : null,
            };
          })
      );
      setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const all = items ?? [];
    return {
      all: all.length,
      image: all.filter((item) => item.mediaType === "image").length,
      video: all.filter((item) => item.mediaType === "video").length,
    };
  }, [items]);

  const visible = useMemo(() => {
    const all = items ?? [];
    if (filter === "all") return all;
    return all.filter((item) => item.mediaType === filter);
  }, [filter, items]);

  const handleDownload = useCallback(
    async (item: CloudCreation) => {
      setNotice(null);
      const target = await creationsAdapter.downloadCreation(item.id);
      const url = target.ok ? resolveApiUrl(target.data.url) : null;
      const result = url
        ? await downloadImage({
            url,
            baseName: `wallhaze-${item.id.slice(0, 8)}`,
            fallbackMime:
              item.mediaType === "video" ? "video/mp4" : "image/png",
          })
        : "failed";
      if (result === "downloaded") {
        setNotice({ tone: "success", message: t("downloadSaved") });
      } else if (result === "opened") {
        setNotice({ tone: "warning", message: tCommon("downloadOpened") });
      } else {
        setNotice({ tone: "warning", message: tCommon("downloadFailed") });
      }
    },
    [t, tCommon]
  );

  const handleDelete = useCallback(
    async (item: CloudCreation) => {
      if (
        !window.confirm(
          `${t("cloudDeleteConfirmTitle")}\n\n${t("cloudDeleteConfirmBody")}`
        )
      ) {
        return;
      }
      const result = await creationsAdapter.deleteCreation(item.id);
      if (!result.ok) {
        setNotice({ tone: "warning", message: t("cloudDeleteFailed") });
        return;
      }
      setItems(
        (current) =>
          current?.filter((entry) => entry.id !== item.id) ?? current
      );
      setNotice({ tone: "success", message: t("cloudDeleteDone") });
    },
    [t]
  );

  if (state === "hidden") return null;

  return (
    <section aria-labelledby="cloud-creations" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="cloud-creations" className="text-lg font-semibold">
            {t("cloudTitle")}
          </h2>
          <p className="mt-2 text-sm text-zinc-400">{t("cloudSubtitle")}</p>
          <p className="mt-1 text-xs text-amber-200/80">
            {t("retentionPolicy")}
          </p>
        </div>
        <p className="text-xs text-zinc-500" aria-live="polite">
          {t("filterAll")}: {counts.all} · {t("filterImages")}: {counts.image} ·{" "}
          {t("filterVideos")}: {counts.video}
        </p>
      </div>

      <div
        role="group"
        aria-label={t("filtersAria")}
        className="mt-4 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-black/30 p-1"
      >
        {(["all", "image", "video"] as const).map((id) => {
          const active = filter === id;
          const label =
            id === "all"
              ? t("filterAll")
              : id === "image"
                ? t("filterImages")
                : t("filterVideos");
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(id)}
              className={`min-h-10 rounded-xl px-3.5 py-1.5 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
                active
                  ? "bg-violet-500/20 text-white ring-1 ring-violet-400/40"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              {label}
              <span className="ml-1.5 text-[11px] text-zinc-500">
                {counts[id]}
              </span>
            </button>
          );
        })}
      </div>

      {state === "loading" ? (
        <p className="mt-4 text-sm text-zinc-500" aria-busy>
          {t("cloudLoading")}
        </p>
      ) : null}

      {state === "error" ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-200"
        >
          {t("cloudLoadFailed")}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className={
            notice.tone === "success"
              ? "mt-4 text-sm text-violet-300"
              : "mt-4 text-sm text-amber-300"
          }
        >
          {notice.message}
        </p>
      ) : null}

      {state === "ready" && items !== null ? (
        items.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={t("cloudEmptyTitle")}
            body={t("cloudEmptyBody")}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={
              filter === "video" ? t("liveEmptyTitle") : t("cloudEmptyTitle")
            }
            body={
              filter === "video" ? t("liveEmptyBody") : t("cloudEmptyBody")
            }
            action={
              filter === "video" ? (
                <Button href="/studio?media=video" variant="secondary">
                  {t("againVideoAction")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) => {
              const style = item.styleId ? findStyle(item.styleId) : undefined;
              const styleLabel = style ? tStyles(style.id) : null;
              const isVideo = item.mediaType === "video";
              const retention = retentionDisplay(item.expiresAt);
              const expired =
                item.expired === true ||
                item.retentionStatus === "expired" ||
                item.retentionStatus === "deleted" ||
                item.retentionStatus === "deleting" ||
                item.retentionStatus === "delete_failed" ||
                retention?.expired === true;
              const retentionTone =
                expired ||
                retention?.tone === "urgent" ||
                retention?.tone === "soon"
                  ? "text-amber-300"
                  : "text-zinc-500";
              return (
                <li
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]"
                >
                  <div className="relative aspect-[4/3] bg-black/40">
                    {expired ? (
                      <div className="flex h-full flex-col items-center justify-center gap-2 bg-black/50 px-5 text-center">
                        <span className="rounded-full border border-amber-400/25 bg-amber-400/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-200">
                          {t("retentionExpired")}
                        </span>
                        <p className="text-xs leading-relaxed text-zinc-500">
                          {t("retentionExpiredBody")}
                        </p>
                      </div>
                    ) : isVideo ? (
                      item.videoUrl ? (
                        <LiveVideoPlayer
                          src={item.videoUrl}
                          poster={item.posterUrl ?? null}
                          durationSeconds={item.durationSeconds}
                          label={item.prompt || t("videoBadge")}
                          fit="cover"
                          fallbackGradient={
                            style?.gradient ??
                            "from-violet-700/40 via-zinc-950 to-black"
                          }
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-amber-200">
                          {t("videoUnavailable")}
                        </div>
                      )
                    ) : (
                      <WallpaperImage
                        src={item.imageUrl ?? undefined}
                        alt={item.prompt || "WallHaze creation"}
                        gradient={
                          style?.gradient ??
                          "from-violet-900/40 to-fuchsia-900/30"
                        }
                        className="h-full w-full object-cover"
                        eager
                      />
                    )}
                    {expired ? null : (
                      <span className="pointer-events-none absolute left-2 top-2 rounded-full border border-white/15 bg-black/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/80 backdrop-blur">
                        {isVideo ? t("videoBadge") : t("imageBadge")}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="line-clamp-2 min-h-8 text-sm text-zinc-300">
                      {item.prompt || "—"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {styleLabel ? `${styleLabel} · ` : ""}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                    {retention || expired ? (
                      <p className={`mt-1 text-[11px] font-medium ${retentionTone}`}>
                        {expired
                          ? t("retentionExpired")
                          : retention
                            ? `${t("retentionDays", { days: retention.days ?? 0 })} · ${formatExpiryDate(
                                item.expiresAt ?? "",
                                locale
                              )}`
                            : null}
                      </p>
                    ) : null}
                    {item.mock ? (
                      <span className="mt-1 inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        {t("mockBadge")}
                      </span>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {expired ? null : isVideo && item.videoDownloadUrl ? (
                        <a
                          href={item.videoDownloadUrl}
                          download
                          className="inline-flex min-h-9 items-center justify-center rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-medium text-zinc-100 transition hover:border-white/35 hover:bg-white/10"
                        >
                          {t("download")}
                        </a>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleDownload(item)}
                        >
                          {t("download")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleDelete(item)}
                      >
                        {t("cloudDeleteAction")}
                      </Button>
                      <Link
                        href={againHref(item)}
                        className="text-xs text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline"
                      >
                        {isVideo ? t("againVideoAction") : t("againAction")}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </section>
  );
}
