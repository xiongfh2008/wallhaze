"use client";

import { useTranslations } from "next-intl";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import type { StudioFormSelection } from "@/lib/studio/form";

export interface ConfirmationSummary {
  prompt: string;
  styleLabel: string | null;
  deviceLabel: string;
  selection: StudioFormSelection;
  /** Preset label already resolved through i18n, or null (model default). */
  presetLabel: string | null;
  /** Video-only review fields. */
  mediaType?: "image" | "video";
  durationSeconds?: number | null;
  motionPrompt?: string | null;
  sourceLabel?: string | null;
}

interface GenerationConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  summary: ConfirmationSummary | null;
  /**
   * Server-provided price in Credits. Null means the price could not be
   * verified — the dialog then offers NO submission control.
   */
  priceCredits?: number | null;
  /**
   * Whether submission is allowed (services available AND balance covers
   * the price). False shows the reason and hides the Confirm control.
   */
  canConfirm?: boolean;
  /** Why confirmation is blocked, shown in the amber notice. */
  creditsMessage?: string | null;
  /** Confirms a generation; present only when the price is known. */
  onConfirm?: () => void;
  /** True while the confirmed job is being created. */
  submitting?: boolean;
  /**
   * True when the backend runs the mock provider: the credits box then
   * describes an honest test preview (no charge) instead of offering a
   * real reservation.
   */
  mockMode?: boolean;
}

/**
 * Pre-submission review dialog.
 *
 * Shows exactly what a generation uses — prompt digest, style, device,
 * ratio, resolution — plus the credits situation. The Confirm control only
 * exists when the backend returned a real price; otherwise the dialog states
 * honestly what is unavailable and offers no submission path. In mock mode
 * the box says "test preview" instead of promising a charge the backend will
 * release.
 */
export default function GenerationConfirmDialog({
  open,
  onClose,
  summary,
  priceCredits = null,
  canConfirm = true,
  creditsMessage = null,
  onConfirm,
  submitting = false,
  mockMode = false,
}: GenerationConfirmDialogProps) {
  const t = useTranslations("generator");
  // The credits copy lives in the shared `credits` namespace — the same
  // strings the studio's CreditsNotice renders (no duplicated copy).
  const tCredits = useTranslations("credits");

  if (!summary) return null;

  const promptDigest =
    summary.prompt.trim().length > 0
      ? summary.prompt.trim()
      : t("confirmNoPromptDigest");
  const title =
    summary.mediaType === "video"
      ? t("confirmVideoTitle")
      : t("confirmTitle");

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={title}
      closeOnBackdrop
      panelClassName="w-full max-w-md"
    >
      <div
        role="alertdialog"
        aria-label={title}
        className="rounded-2xl border border-white/10 bg-[#0a0710]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        <h2 className="text-lg font-semibold text-white">{title}</h2>

        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-zinc-500">{t("promptLabel")}</dt>
            <dd className="min-w-0 flex-1 break-words text-zinc-200">
              <span className="line-clamp-2 block">{promptDigest}</span>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-zinc-500">{t("styleLegend")}</dt>
            <dd className="text-zinc-200">
              {summary.styleLabel ?? t("noStyle")}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-zinc-500">
              {t("deviceLegend")}
            </dt>
            <dd className="text-zinc-200">{summary.deviceLabel}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-zinc-500">
              {t("ratioLegend")}
            </dt>
            <dd className="text-zinc-200">{summary.selection.ratio}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-zinc-500">
              {summary.mediaType === "video"
                ? t("durationLabel")
                : t("resolutionLegend")}
            </dt>
            <dd className="text-zinc-200">
              {summary.mediaType === "video"
                ? t("durationSeconds", {
                    seconds: summary.durationSeconds ?? 5,
                  })
                : summary.presetLabel ?? t("modelDefault")}
            </dd>
          </div>
          {summary.mediaType === "video" ? (
            <>
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-zinc-500">
                  {t("motionLabel")}
                </dt>
                <dd className="min-w-0 flex-1 break-words text-zinc-200">
                  <span className="line-clamp-2 block">
                    {summary.motionPrompt?.trim() || t("noMotionPrompt")}
                  </span>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-zinc-500">
                  {t("sourceLabel")}
                </dt>
                <dd className="min-w-0 flex-1 truncate text-zinc-200">
                  {summary.sourceLabel ?? t("textToVideo")}
                </dd>
              </div>
            </>
          ) : null}
        </dl>

        {/* Credits row — a real price is shown only when the backend runs a
            live provider; mock mode describes an honest test preview; no
            price at all means the dialog says pricing is unavailable and the
            confirm control below is absent. */}
        {priceCredits !== null && mockMode ? (
          <div className="mt-4 rounded-xl border border-violet-400/25 bg-violet-400/5 p-3.5">
            <p className="text-sm font-medium text-violet-200">
              {tCredits("mockReadyTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-violet-100/70">
              {tCredits("mockReadyNotice")}
            </p>
            {!canConfirm && creditsMessage ? (
              <p className="mt-1.5 text-xs font-medium text-amber-300">
                {creditsMessage}
              </p>
            ) : null}
          </div>
        ) : priceCredits !== null ? (
          <div className="mt-4 rounded-xl border border-violet-400/25 bg-violet-400/5 p-3.5">
            <p className="text-sm font-medium text-violet-200">
              {tCredits("priceLabel", { credits: priceCredits })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-violet-100/70">
              {tCredits("reserveNotice")}
            </p>
            {!canConfirm && creditsMessage ? (
              <p className="mt-1.5 text-xs font-medium text-amber-300">
                {creditsMessage}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3.5">
            <p className="text-sm font-medium text-amber-200">
              {tCredits("title")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
              {tCredits("notice")}
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} data-autofocus>
            {t("confirmClose")}
          </Button>
          {canConfirm && priceCredits !== null && onConfirm ? (
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={submitting}
            >
              {submitting ? t("generating") : t("confirm")}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
