import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Local prohibited-term blocklist (Waffo AUP requirement: an "actively
 * updated" blocklist — a static list shipped once doesn't count).
 *
 * Layering: every live prompt is FIRST screened by the Waffo Prompt Sift
 * (official requirement), THEN by this local blocklist as defense in
 * depth (brand/character terms and multilingual variants the remote model
 * may score differently). Both layers must allow before a provider call.
 *
 * Maintenance (the requirement is that this file has a real update path):
 *  1. Edit config/blocklist.json — add/remove terms under the six
 *     categories; keep terms clinical and match the published AUP.
 *  2. Bump "version" and "updatedAt".
 *  3. Restart the API/worker processes (the file is loaded on each
 *     blocklist construction; workers pick it up on restart).
 *  4. `npm run blocklist:check` validates the file structure before
 *     commit. Matches are logged to moderation_logs as category names.
 */

export interface BlocklistFile {
  version: number;
  updatedAt: string;
  notes?: string;
  categories: Record<string, string[]>;
}

export interface LoadedBlocklist {
  version: number;
  updatedAt: string;
  /** Category name -> compiled case-insensitive matchers. */
  matchers: Map<string, RegExp[]>;
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase();
}

export function parseBlocklist(raw: unknown): LoadedBlocklist {
  const file = raw as BlocklistFile;
  if (
    !file ||
    typeof file.version !== "number" ||
    typeof file.updatedAt !== "string" ||
    !file.updatedAt ||
    !file.categories ||
    typeof file.categories !== "object"
  ) {
    throw new Error("blocklist.json is missing version/updatedAt/categories");
  }
  const matchers = new Map<string, RegExp[]>();
  for (const [category, terms] of Object.entries(file.categories)) {
    if (!Array.isArray(terms) || terms.length === 0) {
      throw new Error(`blocklist category "${category}" must be a non-empty array`);
    }
    matchers.set(
      category,
      terms.map((term) => {
        if (typeof term !== "string" || normalizeTerm(term).length === 0) {
          throw new Error(`blocklist category "${category}" has an empty term`);
        }
        // Escape regex metacharacters; match as a plain substring of the
        // normalized prompt. Word boundaries are unsafe across scripts.
        const escaped = normalizeTerm(term).replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
        return new RegExp(escaped, "i");
      })
    );
  }
  return { version: file.version, updatedAt: file.updatedAt, matchers };
}

/** Path resolution works from src/ (tsx) and dist/ (compiled) layouts. */
function blocklistPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../config/blocklist.json"), // dist/business -> config
    path.resolve(here, "../../..", "config/blocklist.json"), // src/business -> config
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error("config/blocklist.json not found");
}

let cached: LoadedBlocklist | null = null;

/** Loads (and memoizes) the blocklist; call resetBlocklistCache after hot updates. */
export function loadBlocklist(): LoadedBlocklist {
  if (!cached) {
    cached = parseBlocklist(JSON.parse(readFileSync(blocklistPath(), "utf8")));
  }
  return cached;
}

export function resetBlocklistCache(): void {
  cached = null;
}

/**
 * Returns the categories matched by the prompt (normalized whitespace +
 * lowercase comparison via case-insensitive regexes). Never returns the
 * prompt itself — only category names, safe for moderation_logs.
 */
export function matchBlocklist(prompt: string): string[] {
  const blocklist = loadBlocklist();
  const normalized = prompt.replace(/\s+/g, " ").toLowerCase();
  const matched: string[] = [];
  for (const [category, regexes] of blocklist.matchers) {
    if (regexes.some((regex) => regex.test(normalized))) {
      matched.push(category);
    }
  }
  return matched;
}
