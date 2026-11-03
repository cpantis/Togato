import { defineConfig } from "vitest/config";

// teste de integrare: API-ul real pe un Postgres real (TEST_DATABASE_URL)
export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    setupFiles: ["test/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
