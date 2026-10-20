import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    "className" | "children"
  > {
  options: readonly SelectOption[];
  className?: string;
}

/**
 * Native select styled to match the dark input. Stays a real <select> so
 * mobile platforms open their own picker; the chevron is decorative.
 */
export default function Select({
  options,
  className = "",
  ...rest
}: SelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        {...rest}
        className="w-full cursor-pointer appearance-none rounded-full border border-white/10 bg-black/40 py-2 pl-4 pr-9 text-sm text-zinc-100 outline-none transition hover:border-white/20 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#0a0710]">
            {option.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
