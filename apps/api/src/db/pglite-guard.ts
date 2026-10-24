import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPgliteDatabase, type Database } from "./database.js";

/**
 * Local-development PGlite lifecycle guard.
 *
 * PGlite is a single-process PostgreSQL build with relaxed durability: a
 * hard process kill can leave `postmaster.pid` plus an invalid WAL
 * checkpoint (`PANIC: could not locate a valid checkpoint record`) and the
 * directory then refuses to open forever. Two local databases were lost
 * that way, so the dev path now:
 *
 * 1. probes the directory in a CHILD process before opening it — a corrupt
 *    database aborts the probe (WASM `Aborted()`), never the API process;
 * 2. moves an unopenable directory aside (quarantine, never deleted) and
 *    restores the newest backup when one exists;
 * 3. writes a backup after every GRACEFUL close. Force kills therefore
 *    cost at most the work since the previous clean stop;
 * 4. refuses to start when another API already answers on PORT — two
 *    processes opening one PGlite directory corrupt each other.
 *
 * Backups live next to the database (`<dir>-backups`), newest last, and a
 * bounded number are kept.
 */

const PROBE_TIMEOUT_MS = 120_000;
const KEEP_BACKUPS = 3;

export interface PgliteGuardOptions {
  /** Backup root; defaults to `<dir>-backups`. */
  backupDir?: string;
  log?: (message: string) => void;
}

function defaultLog(message: string): void {
  console.warn(`[pglite] ${message}`);
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function probeScriptPath(): string {
  const ts = fileURLToPath(new URL("./pglite-probe.ts", import.meta.url));
  if (existsSync(ts)) return ts;
  return fileURLToPath(new URL("./pglite-probe.js", import.meta.url));
}

export type ProbeStatus = "ok" | "corrupt" | "unavailable";

export interface ProbeResult {
  status: ProbeStatus;
  detail: string;
}

/** The API package root — the child runs with this as its cwd. */
function packageRoot(): string {
  return fileURLToPath(new URL("../..", import.meta.url));
}

/**
 * Opens and closes the database in an isolated child process. A corrupt
 * directory makes that child exit 3 ("corrupt"); infrastructure failures
 * (missing loader, timeout) are reported as "unavailable" and never cause
 * a healthy database to be quarantined.
 */
export function probePglite(dir: string): ProbeResult {
  // Absolute path: the child runs with the package root as cwd, so a
  // relative path from the caller would resolve differently there.
  const target = resolve(dir);
  if (!existsSync(target)) return { status: "ok", detail: "new database" };
  const script = probeScriptPath();
  let args: string[];
  if (script.endsWith(".js")) {
    args = [script, target];
  } else {
    try {
      // Resolve the TypeScript loader from THIS package (not the caller's
      // cwd), so probes work no matter where the API was started from.
      const loader = createRequire(import.meta.url).resolve("tsx");
      args = ["--import", pathToFileURL(loader).href, script, target];
    } catch (error) {
      return {
        status: "unavailable",
        detail: `TypeScript loader unavailable: ${String(error)}`,
      };
    }
  }
  const result = spawnSync(process.execPath, args, {
    cwd: packageRoot(),
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    env: { ...process.env, PGLITE_PROBE: "1" },
  });
  const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(-800);
  if (result.status === 0) return { status: "ok", detail };
  if (result.error) {
    return {
      status: "unavailable",
      detail: `${String(result.error)} ${detail}`.trim(),
    };
  }
  if (
    result.status === 3 ||
    /PANIC|Aborted\(\)|valid checkpoint record|invalid checkpoint|invalid resource manager ID/i.test(
      detail
    )
  ) {
    return { status: "corrupt", detail };
  }
  return { status: "unavailable", detail };
}

function backupRoot(dir: string, options: PgliteGuardOptions): string {
  return resolve(options.backupDir ?? `${dir}-backups`);
}

function backupEntries(dir: string, options: PgliteGuardOptions): string[] {
  const root = backupRoot(dir, options);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort();
}

/** Copies the (closed) database directory and prunes old backups. */
export function backupPgliteDir(
  dir: string,
  options: PgliteGuardOptions = {}
): string | null {
  const source = resolve(dir);
  if (!existsSync(source)) return null;
  const root = backupRoot(source, options);
  mkdirSync(root, { recursive: true });
  const target = join(root, stamp());
  cpSync(source, target, { recursive: true });
  // A restored directory must never inherit a stale lock file.
  rmSync(join(target, "postmaster.pid"), { force: true });
  const entries = readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort();
  for (const old of entries.slice(0, Math.max(0, entries.length - KEEP_BACKUPS))) {
    rmSync(join(root, old), { recursive: true, force: true });
  }
  return target;
}

/** Newest backup path, or null when none exists. */
export function latestBackup(
  dir: string,
  options: PgliteGuardOptions = {}
): string | null {
  const entries = backupEntries(dir, options);
  return entries.length > 0
    ? join(backupRoot(dir, options), entries[entries.length - 1])
    : null;
}

function quarantine(dir: string): string {
  const target = `${resolve(dir)}-corrupt-${stamp()}`;
  try {
    renameSync(resolve(dir), target);
  } catch (error) {
    throw new Error(
      `The development database at ${dir} cannot be opened and could not be moved aside — ` +
        `another process may still hold it. Stop every API process (npm run stop), then retry. ` +
        `Cause: ${String(error)}`
    );
  }
  return target;
}

/**
 * Opens PGlite, repairing an unopenable directory from the newest backup.
 * Never deletes a corrupt directory: it is renamed to `<dir>-corrupt-<ts>`.
 */
export async function openPgliteGuarded(
  dir: string,
  options: PgliteGuardOptions = {}
): Promise<{ db: Database; repaired: boolean; dir: string }> {
  // Everything below uses one absolute path: quarantine, backup lookup,
  // restore, and the actual open must all reference the same directory.
  const target = resolve(dir);
  const log = options.log ?? defaultLog;
  let repaired = false;
  if (existsSync(target)) {
    const probe = probePglite(target);
    if (probe.status === "unavailable") {
      throw new Error(
        `Could not verify the development database at ${target}: ${probe.detail || "(no detail)"}. ` +
          `Refusing to open it blindly — the probe failure is not evidence of corruption.`
      );
    }
    if (probe.status === "corrupt") {
      repaired = true;
      log(`startup probe failed: ${probe.detail || "(no detail)"}`);
      const moved = quarantine(target);
      log(`corrupt database preserved at ${moved}`);
      const backup = latestBackup(target, options);
      if (backup) {
        log(`restoring newest backup ${backup}`);
        cpSync(backup, target, { recursive: true });
        rmSync(join(target, "postmaster.pid"), { force: true });
      } else {
        log("no backup found — starting an empty database");
      }
    }
  }
  const db = await createPgliteDatabase(target);
  return { db, repaired, dir: target };
}

/** Closes the database and writes the backup that makes recovery possible. */
export async function closePgliteGuarded(
  db: Database,
  dir: string,
  options: PgliteGuardOptions = {}
): Promise<void> {
  const log = options.log ?? defaultLog;
  try {
    await db.close();
  } catch (error) {
    log(`close failed: ${String(error)}`);
  }
  try {
    const target = backupPgliteDir(resolve(dir), options);
    if (target) log(`backup written to ${target}`);
  } catch (error) {
    log(`backup failed: ${String(error)}`);
  }
}

/** True when an API already serves `/health` on this port. */
export async function isApiRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Guards the single-process dev database. Call before opening PGlite from
 * any process (API or ops CLI).
 */
export async function assertDevDatabaseAvailable(port: number): Promise<void> {
  if (await isApiRunning(port)) {
    throw new Error(
      `An API already answers on http://127.0.0.1:${port}. PGlite is single-process — ` +
        `stop it first with \`npm run stop\` (graceful, writes a backup), then retry.`
    );
  }
}
