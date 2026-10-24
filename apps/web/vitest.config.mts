import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest runs in the plain Node environment: every suite below tests pure
 * TypeScript modules (state machine, gate, validators, flow, API client),
 * so no DOM shim is required. The safety setup replaces globalThis.fetch
 * with a recording, rejecting guard for EVERY test — network access is
 * denied by default and in-process mocks are injected explicitly per call.
 */
export default defineConfig({
  test: {
    // Node environment by default (pure TS modules). Files needing a DOM
    // opt in per-file with the `@vitest-environment jsdom` pragma.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.safety.ts"],
    // Vitest's documented alias slot — mirrors tsconfig paths. The workspace
    // contracts package is types-only source with no node_modules link, so
    // its runtime imports resolve straight to the TypeScript entry.
    alias: {
      "@": root,
      "@wallhaze/contracts": path.resolve(
        root,
        "../../packages/contracts/src/index.ts"
      ),
    },
  },
});
