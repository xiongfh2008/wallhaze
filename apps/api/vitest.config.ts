import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Test-only configuration for the standalone API. Nothing here starts a
// listening server — fastify apps are exercised via app.inject().
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@wallhaze/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url)
      ),
    },
  },
});
