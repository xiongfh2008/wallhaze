import type { Database } from "../db/database.js";
import { OutputModerationService } from "./output-moderation.js";
import { recordModerationLog } from "./moderation.js";

/**
 * AIGC stage 3: async re-scan of PUBLISHED gallery content.
 *
 * Waffo's AIGC compliance page requires that published images/videos are
 * scanned asynchronously whenever user works are publicly visible. The
 * gallery is served by the Cloudflare frontend (preset wallpapers +
 * human-reviewed community submissions); this job fetches the published
 * manifest, screens every listed asset through the SAME output moderation
 * service used at generation time, and records one moderation_logs row
 * (stage='gallery_scan') per asset.
 *
 * A "block" verdict does NOT delete anything automatically: it records
 * disposition='flagged_for_takedown' and the operator acts through the
 * existing human tools (community:unpublish / the media-rights quarantine
 * CLI). This keeps the publish pipeline manual-review-by-owner while
 * adding the required automated re-scan + record.
 *
 * Fail closed: when the moderation service is unavailable for an asset,
 * the row is action='unavailable' and the run summary says so — the asset
 * stays published (it was screened at publish time) but the gap is
 * visible in the audit log instead of being silently ignored.
 */

export interface GalleryManifestEntry {
  /** Stable asset identifier (e.g. "preset:sakura-nights", "community:my-work"). */
  id: string;
  type: "image" | "video";
  /** Absolute URL of the published media file. */
  url: string;
}

export interface GalleryRescanResult {
  scanned: number;
  allow: number;
  block: number;
  unavailable: number;
  /** Asset ids whose verdict was not "allow" (for operator follow-up). */
  flagged: string[];
  unscreenable: string[];
}

function parseManifest(raw: unknown): GalleryManifestEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error("manifest must be a JSON array");
  }
  return raw.map((entry) => {
    const item = entry as { id?: unknown; type?: unknown; url?: unknown };
    if (
      typeof item.id !== "string" ||
      (item.type !== "image" && item.type !== "video") ||
      typeof item.url !== "string" ||
      !/^https:\/\//.test(item.url)
    ) {
      throw new Error(
        "manifest entries must be { id: string, type: 'image'|'video', url: https URL }"
      );
    }
    return { id: item.id, type: item.type, url: item.url };
  });
}

export async function rescanPublishedGallery(
  db: Database,
  options: {
    manifestUrl: string;
    moderation: OutputModerationService;
    fetcher?: typeof fetch;
    limit?: number;
  }
): Promise<GalleryRescanResult> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(options.manifestUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`manifest fetch failed with status ${response.status}`);
  }
  const manifest = parseManifest(await response.json().catch(() => null));
  const limit = options.limit ?? manifest.length;
  const result: GalleryRescanResult = {
    scanned: 0,
    allow: 0,
    block: 0,
    unavailable: 0,
    flagged: [],
    unscreenable: [],
  };

  for (const entry of manifest.slice(0, limit)) {
    result.scanned += 1;
    let verdictAction: "allow" | "block" | "unavailable";
    let categories: string[] = [];
    try {
      const media = await fetcher(entry.url, { signal: AbortSignal.timeout(60_000) });
      if (!media.ok) {
        verdictAction = "unavailable";
      } else {
        const bytes = Buffer.from(await media.arrayBuffer());
        const verdict =
          entry.type === "image"
            ? await options.moderation.screenImage({
                bytes,
                mime: media.headers.get("content-type") ?? "image/png",
              })
            : await options.moderation.screenVideo({
                bytes,
                mime: media.headers.get("content-type") ?? "video/mp4",
                durationSeconds: null,
              });
        verdictAction = verdict.action;
        categories = verdict.categories;
      }
    } catch {
      verdictAction = "unavailable";
    }

    await recordModerationLog(db, {
      jobId: null,
      assetId: entry.id,
      stage: "gallery_scan",
      service: "output_moderation",
      action: verdictAction,
      category: categories.length > 0 ? categories.join(",") : null,
      requestId: null,
      disposition:
        verdictAction === "allow"
          ? "published"
          : verdictAction === "block"
            ? "flagged_for_takedown"
            : "rescan_failed_visible_in_audit",
    });

    if (verdictAction === "allow") result.allow += 1;
    else if (verdictAction === "block") {
      result.block += 1;
      result.flagged.push(entry.id);
    } else {
      result.unavailable += 1;
      result.unscreenable.push(entry.id);
    }
  }
  return result;
}
