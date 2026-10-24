/** Server-owned 30-day retention is surfaced, never recomputed for storage. */
export const CLOUD_RETENTION_DAYS = 30;

export type RetentionTone = "normal" | "soon" | "urgent" | "expired";

export interface RetentionDisplay {
  days: number | null;
  tone: RetentionTone;
  expired: boolean;
}

/** Whole days remaining, rounded up; null when the server gave no expiry. */
export function retentionDisplay(
  expiresAt: string | null | undefined,
  nowMs = Date.now()
): RetentionDisplay | null {
  if (!expiresAt) return null;
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return null;
  const days = Math.ceil((expires - nowMs) / 86_400_000);
  if (days <= 0) return { days: 0, tone: "expired", expired: true };
  if (days <= 1) return { days, tone: "urgent", expired: false };
  if (days <= 7) return { days, tone: "soon", expired: false };
  return { days, tone: "normal", expired: false };
}

export function formatExpiryDate(
  expiresAt: string,
  locale: string
): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return expiresAt;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
