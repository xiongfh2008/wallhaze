import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Test-only configuration. This file does not affect next.config.ts, the
// running dev server on localhost:3000, or the production build pipeline.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Pure Node environment — no browser, no jsdom, no listening servers.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // runs BEFORE any test file (and therefore before route.ts is imported),
    // so the network guard is active before any business module loads.
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15_000,
    // Auto-restore vi.spyOn mocks and vi.stubEnv values after every test so
    // environment state can never leak between cases (T03-B2 §5.3).
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
  resolve: {
    // Mirror the project's tsconfig "@/*" path alias.
    alias: {
      "@": projectRoot,
    },
  },
});
