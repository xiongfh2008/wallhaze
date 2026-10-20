"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { STYLE_SELECT_EVENT, findStyle } from "@/lib/styles";

/**
 * Applies a `?style=<id>` query parameter on /studio by dispatching the
 * same event the homepage used before the split — the generator keeps its
 * own state, this only nudges it. Invalid or unknown ids are ignored.
 *
 * Rendered inside a Suspense boundary on the studio page (required for
 * useSearchParams under cacheComponents).
 */
export default function StudioStylePreselect() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const requested = searchParams.get("style");
    if (!requested || !findStyle(requested)) return;
    // The generator registers its event listener in its own mount effect;
    // a macrotask delay guarantees this dispatch happens after that
    // subscription exists, regardless of sibling effect order.
    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(STYLE_SELECT_EVENT, { detail: requested })
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  return null;
}
