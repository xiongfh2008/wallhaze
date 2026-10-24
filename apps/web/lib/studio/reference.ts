/**
 * Reference-image pre-flight checks (FE04-A).
 *
 * Mirrors the backend contract (packages/contracts + apps/api): PNG/JPEG/WebP
 * only, ≤5 MiB decoded, empty files rejected. The server re-verifies
 * everything — including real magic bytes — so these checks exist purely to
 * fail fast with a good message, never as the security boundary.
 *
 * A file's MIME string is client-controlled: a ".png" text file passes a
 * naive type check. {@link detectImageMime} inspects the actual header bytes
 * so obvious fakes are caught before a 5 MB upload round-trip.
 */

/** MIME types the generation contract accepts for reference images. */
export const REF_ALLOWED_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

/** Matches the API's decoded-content limit (5 MiB). */
export const REF_MAX_BYTES = 5 * 1024 * 1024;

/** Stable error codes — mapped to i18n copy at the UI layer. */
export type ReferenceFileError = "format" | "empty" | "too-large";

/** The minimal shape the checks need (real File objects satisfy it). */
export interface ReferenceFileLike {
  name: string;
  size: number;
  type: string;
}

/**
 * Metadata-level validation: size and declared MIME type. Returns null when
 * the file MAY be acceptable — byte-level confirmation still belongs to
 * {@link detectImageMime}.
 */
export function classifyReferenceFile(
  file: ReferenceFileLike
): ReferenceFileError | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty";
  if (file.size > REF_MAX_BYTES) return "too-large";
  if (!REF_ALLOWED_MIME_TYPES.includes(file.type)) return "format";
  return null;
}

/** Exact PNG signature (\x89PNG\r\n\x1a\n). */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/**
 * Identifies PNG/JPEG/WebP from the file's leading bytes. Returns the
 * detected MIME type, or null when the header matches nothing known —
 * a renamed text file, a truncated image, anything the backend would
 * reject anyway.
 */
export function detectImageMime(
  bytes: Uint8Array | null | undefined
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (!bytes || bytes.length < 4) return null;

  // PNG — full 8-byte signature (check all 8 when available; a shorter
  // buffer claiming PNG is treated as unknown).
  if (bytes.length >= PNG_SIGNATURE.length) {
    let isPng = true;
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
      if (bytes[i] !== PNG_SIGNATURE[i]) {
        isPng = false;
        break;
      }
    }
    if (isPng) return "image/png";
  }

  // JPEG — starts with FF D8 FF.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP — "RIFF" container with "WEBP" at offset 8.
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 //    P
  ) {
    return "image/webp";
  }

  return null;
}

/** True when the declared MIME type agrees with the detected header (or no
 * header could disagree — an undetectable file is left to the server). */
export function mimeMatchesHeader(
  declaredType: string,
  bytes: Uint8Array | null | undefined
): boolean {
  const detected = detectImageMime(bytes);
  if (detected === null) return true;
  return detected === declaredType;
}

/**
 * Reads the first `count` bytes of a Blob/File. Resolves null on any
 * failure (unreadable file, permission, unknown environment) — callers
 * treat "cannot inspect" as "defer to the server", never as a rejection.
 */
export async function readFileHeader(
  file: Blob,
  count = 12
): Promise<Uint8Array | null> {
  try {
    const slice = file.slice(0, count);
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}
