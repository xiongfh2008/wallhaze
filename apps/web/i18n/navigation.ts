import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation APIs. Components must use these instead of
 * next/link and next/navigation so internal links automatically carry the
 * active locale prefix (e.g. `/zh/studio`).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
