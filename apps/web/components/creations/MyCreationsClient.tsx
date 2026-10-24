"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  loadGenerationHistory,
  removeGenerationHistoryEntry,
  type GenerationHistoryEntry,
} from "@/lib/history";
import {
  downloadImage,
  markDownloading,
  markDownloadFinished,
} from "@/lib/download";
import { buildStudioRestoreHref } from "@/lib/studio/restore";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import WallpaperImage from "@/components/WallpaperImage";

/** Notice tones mirror the shared Toast semantics (success/warning/error). */
type NoticeTone = "success" | "warning" | "error";

/** One visible status message; the tone distinguishes saved vs. not saved. */
interface Notice {
  tone: NoticeTone;
  message: string;
}

/**
 * My Creations grid (FE07) — reads the device-local generation history
 * (wallhaze:history:v1, max 20 entries) and renders it honestly:
 * - local records only, clearly labeled as device-local (never "cloud");
 * - deletion removes the LOCAL record only (after a real confirm);
 * - expired/unreachable remote images get an explicit error state with the
 *   prompt/settings kept for re-creation;
 * - no reference-image data is ever rendered (history never stores any).
 */
export default function MyCreationsClient() {
  const t = useTranslations("creations");
  const tCommon = useTranslations("common");
  const [entries, setEntries] = useState<GenerationHistoryEntry[] | null>(null);
  const [brokenIds, setBrokenIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(
    new Set()
  );

  useEffect(() => {
    // Deliberate mount-time read of an external system (device storage):
    // must run after hydration, so a lazy useState initializer would render
    // mismatched server HTML. The null->skeleton state covers that window.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(loadGenerationHistory());
  }, []);

  const handleDownload = useCallback(
    async (entry: GenerationHistoryEntry) => {
      if (downloadingIds.has(entry.id)) return;
      setDownloadingIds((current) => markDownloading(current, entry.id));
      setNotice(null);
      try {
        const result = await downloadImage({
          url: entry.imageUrl,
          baseName: `wallhaze-${entry.id.slice(0, 8)}`,
          fallbackMime: "image/png",
        });
        // Three distinct outcomes — "opened" is NOT "saved" (audit P1).
        if (result === "downloaded") {
          setNotice({ tone: "success", message: t("downloadSaved") });
        } else if (result === "opened") {
          setNotice({ tone: "warning", message: tCommon("downloadOpened") });
        } else {
          setNotice({ tone: "error", message: tCommon("downloadFailed") });
        }
      } catch {
        setNotice({ tone: "error", message: tCommon("downloadFailed") });
      } finally {
        setDownloadingIds((current) => markDownloadFinished(current, entry.id));
      }
    },
    [downloadingIds, t, tCommon]
  );

  const handleDelete = useCallback(
    (entry: GenerationHistoryEntry) => {
      const confirmed = window.confirm(
        `${t("deleteConfirmTitle")}\n\n${t("deleteConfirmBody")}`
      );
      if (!confirmed) return;
      if (removeGenerationHistoryEntry(entry.id)) {
        setEntries((current) =>
          current ? current.filter((item) => item.id !== entry.id) : current
        );
        setBrokenIds((current) => {
          const next = new Set(current);
          next.delete(entry.id);
          return next;
        });
        setNotice({ tone: "success", message: t("deleteDone") });
      }
    },
    [t]
  );

  const markBroken = useCallback((id: string) => {
    setBrokenIds((current) => new Set(current).add(id));
  }, []);

  if (entries === null) {
    return (
      <div
        className="mt-8 h-40 animate-pulse rounded-3xl border border-white/10 bg-white/[0.02]"
        aria-hidden
      />
    );
  }

  return (
    <div>
      {/* Honest storage notice — local only, never cloud. */}
      <div
        role="note"
        className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 text-sm leading-relaxed text-zinc-400"
      >
        <p>{t("localNotice")}</p>
        <p className="mt-1 text-zinc-500">{t("cloudNotice")}</p>
      </div>

      <p aria-live="polite" className="mt-4 text-sm text-zinc-500">
        {t("countLabel", { count: entries.length })}
      </p>
      {notice ? (
        <p
          aria-live="polite"
          className={`mt-1 text-sm ${
            notice.tone === "success"
              ? "text-violet-300"
              : notice.tone === "warning"
                ? "text-amber-300"
                : "text-red-300"
          }`}
          role="status"
        >
          {notice.message}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={t("emptyTitle")}
          body={t("emptyBody")}
          action={
            <Button href="/studio" variant="secondary">
              {t("emptyAction")}
            </Button>
          }
        />
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => {
            const broken = brokenIds.has(entry.id);
            return (
              <li
                key={entry.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]"
              >
                <div className="relative aspect-[4/3] bg-black/40">
                  {broken ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
                      <p className="text-sm font-medium text-zinc-200">
                        {t("brokenImageTitle")}
                      </p>
                      <p className="text-xs leading-relaxed text-zinc-500">
                        {t("brokenImageBody")}
                      </p>
                    </div>
                  ) : (
                    <WallpaperImage
                      src={entry.imageUrl}
                      alt={entry.prompt || "WallHaze creation"}
                      gradient="from-violet-900/40 to-fuchsia-900/30"
                      className="h-full w-full object-cover"
                      eager
                      onError={() => markBroken(entry.id)}
                    />
                  )}
                </div>

                <div className="p-4">
                  <p className="line-clamp-2 min-h-8 text-sm text-zinc-300">
                    {entry.prompt || "—"}
                  </p>
                  {entry.width !== null && entry.height !== null ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      {t("sizeLabel")}: {entry.width} × {entry.height}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={broken || downloadingIds.has(entry.id)}
                      onClick={() => void handleDownload(entry)}
                    >
                      {downloadingIds.has(entry.id)
                        ? tCommon("downloadBusy")
                        : t("download")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(entry)}
                    >
                      {t("deleteAction")}
                    </Button>
                    <Link
                      href={buildStudioRestoreHref(entry)}
                      className="text-xs text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline"
                    >
                      {t("againAction")}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
