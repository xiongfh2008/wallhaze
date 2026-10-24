import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Graceful local API stop — `npm run stop`.
 *
 * PGlite is a single-process database with relaxed durability: killing the
 * API process can corrupt its WAL (this already cost two local databases).
 * This script asks the API to shut down through the dev-only
 * POST /internal/shutdown endpoint; the server then stops the worker,
 * closes Fastify, closes PGlite and writes a backup before exiting.
 */

function readDotEnv(path) {
  const values = {};
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return values;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const fileEnv = readDotEnv(resolve(process.cwd(), ".env"));
const port = process.env.PORT || fileEnv.PORT || "4000";
const token = process.env.OPS_SHUTDOWN_TOKEN || fileEnv.OPS_SHUTDOWN_TOKEN;
const base = `http://127.0.0.1:${port}`;

async function healthy() {
  try {
    const response = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

if (!token) {
  console.error(
    "[stop] OPS_SHUTDOWN_TOKEN is not configured. Without it the API has no\n" +
      "       graceful stop path — press Ctrl+C in its terminal instead of\n" +
      "       killing the process, or add OPS_SHUTDOWN_TOKEN to apps/api/.env."
  );
  process.exit(1);
}

if (!(await healthy())) {
  console.log(`[stop] no API is listening on ${base} — nothing to do.`);
  process.exit(0);
}

let response;
try {
  response = await fetch(`${base}/internal/shutdown`, {
    method: "POST",
    headers: { "x-ops-token": token },
    signal: AbortSignal.timeout(5_000),
  });
} catch (error) {
  console.error("[stop] shutdown request failed:", error.message);
  process.exit(1);
}

if (response.status === 401) {
  console.error(
    "[stop] the API rejected OPS_SHUTDOWN_TOKEN (it was probably started with a different value)."
  );
  process.exit(1);
}
if (response.status === 404) {
  console.error(
    "[stop] the API was started before the graceful-stop endpoint existed.\n" +
      "       Restart it once with Ctrl+C, then `npm run stop` will work."
  );
  process.exit(1);
}
if (!response.ok) {
  console.error(`[stop] unexpected status ${response.status}`);
  process.exit(1);
}

console.log("[stop] shutdown accepted; waiting for the API to close...");
for (let attempt = 0; attempt < 120; attempt += 1) {
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  if (!(await healthy())) {
    // The port closes before the process finishes closing PGlite and
    // writing its backup; give that work a moment before reporting success.
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
    console.log(
      "[stop] API stopped gracefully (the process writes its database backup before exiting)."
    );
    process.exit(0);
  }
}
console.error("[stop] the API did not stop within 30s — check its terminal output.");
process.exit(1);
