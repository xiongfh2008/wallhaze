#!/usr/bin/env node
// Validates config/blocklist.json structure before commit (Waffo AUP:
// the blocklist must stay maintainable — version + updatedAt + the six
// categories). Run: npm run blocklist:check
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../config/blocklist.json");
const data = JSON.parse(readFileSync(file, "utf8"));

const errors = [];
if (!Number.isInteger(data.version) || data.version < 1) {
  errors.push("version must be a positive integer");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(data.updatedAt ?? "")) {
  errors.push("updatedAt must be an ISO date (YYYY-MM-DD)");
}
const REQUIRED = ["nsfw", "csam", "deepfake", "hate_violence", "ip"];
const categories = data.categories ?? {};
for (const category of REQUIRED) {
  if (!Array.isArray(categories[category]) || categories[category].length === 0) {
    errors.push(`category "${category}" must be a non-empty array`);
  }
}
for (const [category, terms] of Object.entries(categories)) {
  for (const term of terms) {
    if (typeof term !== "string" || term.trim().length === 0) {
      errors.push(`category "${category}" has an empty/invalid term`);
    }
  }
}
if (errors.length > 0) {
  console.error(`[blocklist] INVALID:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `[blocklist] ok version=${data.version} updatedAt=${data.updatedAt} ` +
    `categories=${Object.keys(categories).length} terms=${Object.values(categories).reduce((n, t) => n + t.length, 0)}`
);
