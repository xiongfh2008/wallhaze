"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  creditsAdapter,
  resolveCommercialGates,
  type CommercialGates,
} from "@/lib/api/credits";

/**
 * One shared pricing probe for every buy button on the page: the package
 * cards mount simultaneously, so they must not fire one identical request
 * each. The promise latches the first call for the lifetime of the page.
 */
let gatesProbe: Promise<CommercialGates> | null = null;
function probeCommercialGates(): Promise<CommercialGates> {
  gatesProbe ??= creditsAdapter
    .getPricing()
    .then((result) => resolveCommercialGates(result));
  return gatesProbe;
}

interface CheckoutButtonProps {
  /** Enabled CTA — resolved server-side from wallet.checkoutButton. */
  buyLabel: string;
  /** Operator paused the checkout channel — resolved from pricing.pricingPausedCta. */
  pausedLabel: string;
  /** Channel not open yet / probe failed — resolved from pricing.pricingClosedCta. */
  closedLabel: string;
  /** Probe still in flight — resolved from pricing.checkoutComing. */
  loadingLabel: string;
}

/**
 * Status-driven buy button for the pricing page. The backend decides via
 * `purchasesPublic` / `purchasesPaused`; until a probe proves the channel
 * open (and not paused) the button stays disabled with the honest reason —
 * fail-closed, no fake purchase flow. Labels are passed from the server
 * page because the `pricing` namespace is server-only (lib/client-messages.ts).
 */
export default function CheckoutButton({
  buyLabel,
  pausedLabel,
  closedLabel,
  loadingLabel,
}: CheckoutButtonProps) {
  // Null until the probe answers — the disabled neutral state covers SSR,
  // hydration and the in-flight window alike.
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

  if (gates?.purchasesOpen) {
    return (
      <Link
        href="/credits"
        className="mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90"
      >
        {buyLabel}
      </Link>
    );
  }

  const label = !gates
    ? loadingLabel
    : gates.purchasesPaused
      ? pausedLabel
      : closedLabel;

  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className="mt-6 inline-flex min-h-10 w-full cursor-not-allowed items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-400"
    >
      {label}
    </button>
  );
}
