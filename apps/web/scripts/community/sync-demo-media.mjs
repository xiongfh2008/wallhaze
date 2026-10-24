#!/usr/bin/env node
/**
 * Copies demo seed media from private-media/community/demo-media into
 * public/community-demo so the dev server can serve it in demo mode.
 *
 * This is the ONLY path that puts demo media under public/. It is run
 * manually by an operator for demo builds; production builds never run it
 * (package.json wires it to community:demo:prepare, not to build).
 *
 * Usage:
 *   node scripts/community/sync-demo-media.mjs            # copy
 *   node scripts/community/sync-demo-media.mjs --remove   # purge from public
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PRIVATE = path.join(ROOT, "private-media", "community", "demo-media");
const PUBLIC = path.join(ROOT, "public", "community-demo");
const remove = process.argv.includes("--remove");

if (remove) {
  rmSync(PUBLIC, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, removed: path.relative(ROOT, PUBLIC) }));
  process.exit(0);
}

if (!existsSync(PRIVATE)) {
  console.error("[demo-media] nothing to sync:", PRIVATE);
  process.exit(1);
}
cpSync(PRIVATE, PUBLIC, { recursive: true });
console.log(JSON.stringify({ ok: true, synced: path.relative(ROOT, PUBLIC) }));
