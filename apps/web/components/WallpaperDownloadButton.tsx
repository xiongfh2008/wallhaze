"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { downloadImage, timestampedBaseName } from "@/lib/download";
import Button from "./ui/Button";
import ToastStack, { type ToastItem } from "./ui/Toast";

interface WallpaperDownloadButtonProps {
  /** Stable preset id — the only thing used in the file name. */
  wallpaperId: string;
  /** Localized title for the saved-toast copy. */
  title: string;
  /** Image URL to download. Never exposed as a file name. */
  image: string;
  variant?: "primary" | "secondary";
  className?: string;
}

let nextToastId = 0;

/**
 * Detail-page download control. Free, no sign-in, no AI call: the shared
 * helper fetches the image as a Blob (via the API image proxy when
 * configured) and names the file from the preset id + timestamp — the
 * server path and the remote URL never leak into the file name.
 */
export default function WallpaperDownloadButton({
  wallpaperId,
  title,
  image,
  variant = "primary",
  className = "",
}: WallpaperDownloadButtonProps) {
  const t = useTranslations("detail");
  const tCommon = useTranslations("common");
  const tUi = useTranslations("ui");
  const [downloading, setDownloading] = useState(false);
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);

  const dismissToast = (id: number) =>
    setToasts((current) => current.filter((toast) => toast.id !== id));

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const outcome = await downloadImage({
        url: image,
        baseName: timestampedBaseName(`wallhaze-${wallpaperId}`),
      });
      if (outcome === "downloaded") {
        setToasts((current) => [
          ...current,
          {
            id: ++nextToastId,
            message: t("downloadSaved", { title }),
            tone: "success",
          },
        ]);
      } else if (outcome === "opened") {
        setToasts((current) => [
          ...current,
          { id: ++nextToastId, message: tCommon("downloadOpened"), tone: "warning" },
        ]);
      } else {
        setToasts((current) => [
          ...current,
          { id: ++nextToastId, message: tCommon("downloadFailed"), tone: "error" },
        ]);
      }
    } catch {
      // downloadImage never rejects by design; any surprise failure still
      // gets an honest error toast instead of an unhandled rejection.
      setToasts((current) => [
        ...current,
        { id: ++nextToastId, message: tCommon("downloadFailed"), tone: "error" },
      ]);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={className}>
      <Button
        variant={variant}
        onClick={handleDownload}
        loading={downloading}
        aria-label={downloading ? t("downloading") : undefined}
      >
        {downloading ? t("downloading") : t("download")}
      </Button>
      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        dismissLabel={tUi("dismiss")}
        className="mt-3"
      />
    </div>
  );
}
