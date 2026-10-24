"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { STYLE_SELECT_EVENT } from "@/lib/styles";
import {
  STUDIO_RESTORE_EVENT,
  hasRestore,
  parseStudioRestore,
} from "@/lib/studio/restore";

/**
 * Applies Studio preselect parameters on /studio.
 *
 * - `?style=<id>` keeps the original event contract used by gallery cards.
 * - `?prompt=&device=&ratio=&preset=` is the "create again" handoff from My
 *   Creations (audit P2): every value is validated in parseStudioRestore and
 *   the generator keeps ownership of its state via the restore event.
 *
 * Invalid or unknown ids are ignored. Rendered inside a Suspense boundary on
 * the studio page (required for useSearchParams under cacheComponents).
 */
export default function StudioStylePreselect() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Unknown/illegal ids degrade to null — the studio simply starts
    // unstyled, it never crashes on a hand-edited URL.
    const requested = parseStudioRestore(searchParams);
    if (!hasRestore(requested)) return;
    // The generator registers its listeners in its own mount effect; a
    // macrotask delay guarantees this dispatch happens after those
    // subscriptions exist, regardless of sibling effect order.
    const timer = window.setTimeout(() => {
      if (requested.styleId) {
        window.dispatchEvent(
          new CustomEvent(STYLE_SELECT_EVENT, { detail: requested.styleId })
        );
      }
      window.dispatchEvent(
        new CustomEvent(STUDIO_RESTORE_EVENT, { detail: requested })
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  return null;
}
