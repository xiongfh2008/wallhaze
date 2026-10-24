import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Vendors packages/contracts into apps/web/vendor/contracts so Turbopack can
 * resolve @wallhaze/contracts inside the app workspace root (required for
 * container builds; repo-local dev keeps working through the same path).
 */
const root = path.resolve(process.cwd(), "..", "..");
const source = path.join(root, "packages", "contracts");
const target = path.join(process.cwd(), "vendor", "contracts");
if (!existsSync(source)) {
  console.error("[vendor-contracts] missing source:", source);
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true, filter: (s) => !s.includes("node_modules") });
// Turbopack resolves "./x.js" literally (no NodeNext extension mapping), so
// the vendored TS sources must use extensionless relative imports. The API
// keeps the .js forms for its own NodeNext emit.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const srcDir = path.join(target, "src");
for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".ts"))) {
  const fileUrl = path.join(srcDir, file);
  const text = readFileSync(fileUrl, "utf8");
  const rewritten = text.replace(
    /(from\s+["'])(\.[^"']+?)\.js(["'])/g,
    "$1$2$3"
  );
  if (rewritten !== text) writeFileSync(fileUrl, rewritten);
}
console.log("[vendor-contracts] synced", path.relative(root, target));
