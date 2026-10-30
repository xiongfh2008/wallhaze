#!/usr/bin/env node
/**
 * Auto-isolation of gallery assets flagged by output moderation (AIGC
 * stage 3 follow-up). Policy:
 *
 *  - Community works (`community:<id>`): the public preview file is MOVED
 *    to the moderation quarantine (bytes preserved — never deleted) and
 *    the work is flipped to status "withdrawn" in works.json, so every
 *    public surface (pages, sitemap, gallery manifest) stops serving it.
 *  - Registry-managed assets (preset wallpapers, style previews, demos —
 *    any other id): files are OWNED by the rights registry/build, so this
 *    module never touches them; the operator uses the existing media-rights
 *    quarantine CLI (`scripts/media/quarantine-pending.mjs` / rights-admin).
 *    The isolation record notes that instruction.
 *
 * Every action appends to the private audit log with the reason, keeps the
 * original bytes recoverable, and records the manual RESTORE path:
 * community works are restored by moving the file back and flipping the
 * status to "published" (a human false-positive review decision).
 *
 * Pure operations live here so tests can inject temporary roots.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const WITHDRAWN_STATUS = "withdrawn";

export function isolationRoots(webRoot) {
  return {
    webRoot,
    worksFile: path.join(webRoot, "data", "community", "works.json"),
    publicRoot: path.join(webRoot, "public"),
    quarantineDir: path.join(webRoot, "private-media", "moderation", "quarantine"),
    auditFile: path.join(webRoot, "private-media", "moderation", "isolation-log.jsonl"),
  };
}

function appendAudit(auditFile, entry) {
  mkdirSync(path.dirname(auditFile), { recursive: true });
  writeFileSync(auditFile, `${JSON.stringify(entry)}\n`, { flag: "a" });
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}

/** Public URL path ("/community/previews/x.jpg") -> absolute file path. */
export function publicFilePath(roots, urlPath) {
  const decoded = urlPath.split("?")[0];
  return path.join(roots.publicRoot, decoded.replace(/^\//, ""));
}

/**
 * Isolates one flagged manifest entry. Returns a record describing what
 * happened; `restored: false` + `file` fields give the human reviewer the
 * exact recovery path. Throws only on real filesystem errors.
 */
export function isolateFlaggedEntry(entry, roots, { reason = "output_moderation_block", scannedAt = null } = {}) {
  const at = new Date().toISOString();
  const base = {
    at,
    action: "auto_isolate",
    id: entry.id,
    url: entry.url,
    reason,
    scannedAt,
  };

  if (!entry.id.startsWith("community:")) {
    // Registry-managed asset: record + delegate to the rights CLI.
    appendAudit(roots.auditFile, {
      ...base,
      handling: "registry_owned_manual_rights_cli",
      note: "Do NOT move registry-managed files by hand — run scripts/media/quarantine-pending.mjs (moves to quarantine, never deletes) and flip canPubliclyDisplay in the registry.",
    });
    return { id: entry.id, isolated: false, handling: "registry_owned_manual_rights_cli" };
  }

  const workId = entry.id.slice("community:".length);
  const works = JSON.parse(readFileSync(roots.worksFile, "utf8"));
  const work = (works.works ?? []).find((item) => item.id === workId);
  if (!work) {
    appendAudit(roots.auditFile, { ...base, handling: "work_not_found" });
    return { id: entry.id, isolated: false, handling: "work_not_found" };
  }

  const sourcePath = publicFilePath(roots, work.previewAsset);
  const isolated = {
    id: entry.id,
    isolated: false,
    handling: "already_isolated",
  };

  if (work.status === WITHDRAWN_STATUS) {
    return isolated; // idempotent
  }

  // 1. Move the public preview into quarantine (bytes preserved).
  if (existsSync(sourcePath)) {
    const destinationDir = path.join(roots.quarantineDir, workId);
    mkdirSync(destinationDir, { recursive: true });
    const destination = path.join(destinationDir, path.basename(sourcePath));
    if (existsSync(destination)) {
      throw new Error(`quarantine collision for ${workId} — resolve manually before re-running`);
    }
    renameSync(sourcePath, destination);
    isolated.isolated = true;
    isolated.file = destination;
  }

  // 2. Withdraw the work (every public surface derives from this status).
  work.status = WITHDRAWN_STATUS;
  work.withdrawnAt = at;
  work.withdrawnReason = reason;
  writeJsonAtomic(roots.worksFile, works);

  // 3. Audit with the documented human restore path.
  appendAudit(roots.auditFile, {
    ...base,
    handling: "community_withdrawn_file_quarantined",
    publicPath: work.previewAsset,
    file: isolated.file ?? null,
    restore: `Move the quarantined file back to public${work.previewAsset} and set works.json status back to "published" (human false-positive review).`,
  });
  return isolated;
}
