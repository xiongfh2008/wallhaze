import type { AuthUser } from "@/lib/api/auth";

function initialsFor(user: AuthUser): string {
  const name = user.displayName?.trim() || user.email?.split("@")[0] || "?";
  const words = name.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${Array.from(words[0])[0] ?? ""}${Array.from(words[1])[0] ?? ""}`.toUpperCase();
  }
  return Array.from(name).slice(0, 2).join("").toUpperCase();
}

/**
 * Decorative avatar used next to a real account name / menu label. The
 * backend does not currently expose avatar images, so initials are the
 * honest representation — never a stock or fake photo.
 */
export default function UserAvatar({
  user,
  className = "",
}: {
  user: AuthUser;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 font-semibold text-white ring-1 ring-white/15 ${className}`}
    >
      {initialsFor(user)}
    </span>
  );
}
