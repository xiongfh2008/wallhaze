"use client";

import { useEffect, useState } from "react";
import { probeCommercialGates } from "@/components/pricing/CheckoutButton";
import type { CommercialGates } from "@/lib/api/credits";

interface CheckoutStatusNoticeProps {
  /** Checkout open — positive copy, no "coming soon" anywhere. */
  openTitle: string;
  openBody: string;
  /** Operator paused the checkout channel — accurate pause copy. */
  pausedTitle: string;
  pausedBody: string;
  /** Channel closed or probe failed — fail-closed copy, buying stays disabled. */
  closedTitle: string;
  closedBody: string;
}

/**
 * Status-driven checkout notice for the pricing page. It shares the exact
 * same module-level pricing probe as CheckoutButton, so the notice and the
 * buy buttons can never disagree. While the probe is in flight nothing is
 * rendered — the page never claims an open or closed state it has not
 * proven (fail-closed, and no "coming soon" flash on load).
 */
export default function CheckoutStatusNotice({
  openTitle,
  openBody,
  pausedTitle,
  pausedBody,
  closedTitle,
  closedBody,
}: CheckoutStatusNoticeProps) {
  const [gates, setGates] = useState<CommercialGates | null>(null);

  useEffect(() => {
    let cancelled = false;
    void probeCommercialGates().then((result) => {
      if (!cancelled) setGates(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!gates) return null;

  const [title, body, tone] = gates.purchasesOpen
    ? [openTitle, openBody, "open"]
    : gates.purchasesPaused
      ? [pausedTitle, pausedBody, "paused"]
      : [closedTitle, closedBody, "closed"];

  return (
    <section
      aria-labelledby="pricing-checkout"
      className={
        tone === "open"
          ? "mt-12 scroll-mt-28 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-6"
          : "mt-12 scroll-mt-28 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-6"
      }
    >
      <h2
        id="pricing-checkout"
        className="text-lg font-semibold text-zinc-100"
      >
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
    </section>
  );
}
