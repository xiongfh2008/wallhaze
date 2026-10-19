/**
 * sessionStorage bridge for language switches.
 *
 * The generator's state (prompt, selections, current result) lives inside a
 * client component that unmounts when the route changes to another locale.
 * The switcher sets the flag BEFORE navigating; GeneratorSection then saves
 * its state on unmount and restores it on the next mount, so switching
 * languages never loses an in-progress wallpaper.
 *
 * Only small serializable state crosses the bridge — the base64 reference
 * image is deliberately not carried over (multi-MB sessionStorage payload).
 */
export const LANGUAGE_SWITCH_FLAG = "wallhaze:language-switch-pending";
