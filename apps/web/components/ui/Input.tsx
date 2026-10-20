import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  className?: string;
  /** Rendered inside the field on the right (e.g. a clear button). */
  trailing?: ReactNode;
  /** Marks the field invalid for assistive tech; pairs with aria-describedby. */
  invalid?: boolean;
}

/**
 * Shared dark text input. Styling only — no internal state — so the owning
 * component keeps full control of value, validation and announcements.
 */
export default function Input({
  className = "",
  trailing,
  invalid = false,
  ...rest
}: InputProps) {
  return (
    <div className={`relative ${className}`}>
      <input
        {...rest}
        aria-invalid={invalid || undefined}
        className={`w-full rounded-full border bg-black/40 py-2 pl-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20 ${
          invalid
            ? "border-red-400/60"
            : "border-white/10 hover:border-white/20"
        } ${trailing ? "pr-10" : "pr-4"}`}
      />
      {trailing ? (
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}
