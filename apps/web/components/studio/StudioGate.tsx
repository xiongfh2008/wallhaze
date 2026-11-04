"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  creditsAdapter,
  resolveCommercialGates,
} from "@/lib/api/credits";

/**
 * Commercial gate for the /studio workspace (status-driven Coming Soon).
 *
 * On mount it probes the backend pricing endpoint once; the generation
 * experience renders only when the backend proves `studioPublic: true`.
 * Everything else — probe still loading, closed flag, no API base URL,
 * network failure — renders the closed fallback (fail-closed: the UI never
 * assumes a service it could not verify). The fallback is rendered by the
 * server page and passed as a prop, so the closed copy stays server-side
 * i18n with no duplicated translations and no secrets involved.
 */
export default function StudioGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [probed, setProbed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pricing = await creditsAdapter.getPricing();
      if (cancelled) return;
      setOpen(resolveCommercialGates(pricing).studioOpen);
      setProbed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!probed || !open) return <>{fallback}</>;
  return <>{children}</>;
}
