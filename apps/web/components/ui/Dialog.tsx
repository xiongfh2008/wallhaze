"use client";

import { useTranslations } from "next-intl";
import Modal from "./Modal";
import Button from "./Button";

interface DialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  /** Destructive dialogs confirm in red and never close on backdrop tap. */
  destructive?: boolean;
}

/**
 * Confirmation dialog built on the shared Modal: question, explanation and
 * an explicit Confirm / Cancel pair. Replaces window.confirm so the flow
 * stays in-app, themed and keyboard accessible.
 */
export default function Dialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  destructive = false,
}: DialogProps) {
  const tUi = useTranslations("ui");

  return (
    <Modal
      open={open}
      onClose={onCancel}
      label={title}
      closeOnBackdrop={!destructive}
      panelClassName="w-full max-w-md"
    >
      <div
        role="alertdialog"
        aria-label={title}
        className="rounded-2xl border border-white/10 bg-[#0a0710]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            data-autofocus
          >
            {tUi("cancel")}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
          >
            {tUi("confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
