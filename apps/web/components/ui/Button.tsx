import type { MouseEventHandler, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import Spinner from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "danger"
  | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/50 hover:brightness-110 active:scale-[0.98]",
  secondary:
    "border border-white/20 bg-white/5 text-zinc-100 backdrop-blur hover:border-white/35 hover:bg-white/10 active:scale-[0.98]",
  outline:
    "border border-violet-400/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20",
  danger:
    "border border-red-400/40 bg-red-500/15 text-red-200 hover:bg-red-500/25",
  ghost: "text-zinc-300 hover:bg-white/5 hover:text-white",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-4 py-1.5 text-xs",
  md: "px-5 py-2 text-sm",
  lg: "px-8 py-3.5 text-sm",
};

interface CommonButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  /** Shows a spinner and blocks interaction while true. */
  loading?: boolean;
  "aria-label"?: string;
}

interface ButtonAsButtonProps extends CommonButtonProps {
  href?: undefined;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

interface ButtonAsLinkProps extends CommonButtonProps {
  /** Internal destination — rendered through the locale-aware next-intl Link. */
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

/**
 * The app's single button/link styling entry point (primary gradient,
 * secondary glass, outline, danger, ghost). With `href` it renders a
 * locale-aware link; otherwise a real <button>. `loading` swaps in a
 * spinner — it never fakes progress, only mirrors an in-flight action.
 */
export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  loading = false,
  ...rest
}: ButtonProps) {
  const classes = `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`;

  if (rest.href !== undefined) {
    const { href, onClick, "aria-label": ariaLabel } = rest;
    return (
      <Link
        href={href}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        className={classes}
      >
        {loading ? <Spinner className="h-4 w-4" /> : null}
        {children}
      </Link>
    );
  }

  const {
    type = "button",
    disabled,
    onClick,
    "aria-label": ariaLabel,
  } = rest;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={classes}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
