import type { AspectRatioId, HistoryDevice } from "@/lib/sizes";

/** Same-page draft shared when switching Static ↔ Live in the Studio. */
export interface StudioDraft {
  styleId: string | null;
  prompt: string;
  device: HistoryDevice;
  ratio: AspectRatioId;
}

const KEY = "wallhaze:studio-draft:v1";
export const STUDIO_MODE_EVENT = "wallhaze:studio-mode";

export function saveStudioDraft(draft: StudioDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private mode / disabled storage: mode switching simply starts fresh.
  }
}

export function readStudioDraft(): StudioDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioDraft>;
    if (
      typeof parsed.prompt !== "string" ||
      (parsed.device !== "phone" &&
        parsed.device !== "tablet" &&
        parsed.device !== "desktop") ||
      typeof parsed.ratio !== "string" ||
      (parsed.styleId !== null && typeof parsed.styleId !== "string")
    ) {
      return null;
    }
    return {
      styleId: parsed.styleId ?? null,
      prompt: parsed.prompt,
      device: parsed.device,
      ratio: parsed.ratio as AspectRatioId,
    };
  } catch {
    return null;
  }
}
