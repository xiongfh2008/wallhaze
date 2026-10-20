import { SpinnerIcon } from "../icons";

interface SpinnerProps {
  /** Size classes, e.g. "h-4 w-4". */
  className?: string;
  /**
   * Accessible label for standalone spinners ("Loading…"). When omitted the
   * spinner is decorative and the surrounding control carries the state.
   */
  label?: string;
}

/** Inline loading indicator shared by buttons, cards and panels. */
export default function Spinner({ className = "h-4 w-4", label }: SpinnerProps) {
  if (!label) {
    return <SpinnerIcon className={className} />;
  }
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <SpinnerIcon className={className} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
