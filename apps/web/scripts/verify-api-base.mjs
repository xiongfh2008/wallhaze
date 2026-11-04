/**
 * Production-build guard for NEXT_PUBLIC_API_BASE_URL.
 *
 * Resolves the value EXACTLY like vinext does — vinext follows Next.js
 * dotenv precedence (see node_modules/vinext/dist/config/dotenv.js):
 *   process.env > .env.production.local > .env.local > .env.production > .env
 * (NOTE: unlike stock Vite, ".env.local" BEATS ".env.production" here.)
 *
 * The production build is REFUSED when the resolved value:
 *   - is empty/unset, or
 *   - points at localhost / 127.0.0.1 (a dev API can never be the baked-in
 *     production client target), or
 *   - is not an https:// URL.
 *
 * Wired into the `build:vinext` npm script so a mis-configured deploy fails
 * fast instead of shipping a frontend that calls http://localhost:4000.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const NAME = "NEXT_PUBLIC_API_BASE_URL";

/** Minimal dotenv line parser (KEY=VALUE, trims quotes/whitespace). */
function parseDotenv(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Next.js precedence, highest first. */
const FILES = [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
];

function resolveApiBase(cwd = process.cwd()) {
  if (process.env[NAME]?.trim()) return process.env[NAME].trim();
  for (const file of FILES) {
    const p = join(cwd, file);
    if (!existsSync(p)) continue;
    const value = parseDotenv(readFileSync(p, "utf8"))[NAME];
    if (value?.trim()) return value.trim();
  }
  return "";
}

const value = resolveApiBase();

const fail = (reason) => {
  console.error(`\n[verify-api-base] PRODUCTION BUILD REFUSED — ${reason}\n`);
  process.exit(1);
};

if (!value) {
  fail(`${NAME} is empty (see apps/web/.env.production.local)`);
}
if (/localhost|127\.0\.0\.1/i.test(value)) {
  fail(`${NAME} must not point at localhost/127.0.0.1 (got "${value}")`);
}
if (!/^https:\/\//i.test(value)) {
  fail(`${NAME} must be an https:// URL in production (got "${value}")`);
}

console.log(`[verify-api-base] OK — production API base: ${value}`);
