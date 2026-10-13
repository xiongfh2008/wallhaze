"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function getYear() {
  return new Date().getFullYear();
}

function getServerYear() {
  // Static snapshot for prerendering (Next.js Cache Components forbids Date).
  return 2026;
}

/**
 * Reads the current year on the client only; the prerendered page uses
 * the stable server snapshot above.
 */
export default function FooterYear() {
  return useSyncExternalStore(subscribe, getYear, getServerYear);
}
