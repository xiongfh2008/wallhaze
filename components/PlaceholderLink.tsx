"use client";

import type { MouseEvent, ReactNode } from "react";

interface PlaceholderLinkProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

/**
 * Link for destinations that are not implemented yet (sign-in, legal pages…).
 * Prevents navigation so the single-page site never breaks.
 */
export default function PlaceholderLink({
  children,
  className = "",
  title = "Coming soon",
}: PlaceholderLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
  };

  return (
    <a href="#" onClick={handleClick} title={title} className={className}>
      {children}
    </a>
  );
}
