import { defineConfig } from "vitest/config";

// teste unitare: rapide, fără bază de date
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
