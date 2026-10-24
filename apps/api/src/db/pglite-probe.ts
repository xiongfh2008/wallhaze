import { PGlite } from "@electric-sql/pglite";

/**
 * Child-process probe for pglite-guard.ts.
 *
 * Exit codes are the contract:
 * - 0 → the database opened, answered `select 1`, and closed cleanly;
 * - 3 → the database itself could not be opened (corruption);
 * - anything else → the probe itself could not run (never treated as
 *   corruption, so a healthy database is never quarantined by mistake).
 */
const dir = process.argv[2];
if (!dir) {
  console.error("usage: pglite-probe <dir>");
  process.exit(2);
}

try {
  const db = await PGlite.create(dir);
  await db.waitReady;
  const result = await db.query<{ ok: number }>("select 1 as ok");
  if (Number(result.rows[0]?.ok) !== 1) {
    console.error("db-open-failed: probe query returned an unexpected result");
    process.exit(3);
  }
  await db.close();
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === "ENOENT" || code === "EACCES" || code === "EPERM" || code === "ENOTDIR") {
    // Filesystem/configuration problem, not database corruption — the
    // parent must not quarantine a healthy directory because of this.
    console.error(`probe-unavailable: ${message}`);
    process.exit(4);
  }
  console.error(`db-open-failed: ${message}`);
  process.exit(3);
}
