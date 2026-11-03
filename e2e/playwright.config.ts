import { defineConfig } from "@playwright/test";

/**
 * Teste de browser cap-coadă. Pornesc API-ul (8080) și aplicația web construită (3091).
 * Necesită: E2E_DATABASE_URL (o bază dedicată, cu „test” în nume) și `npm run build -w @togato/web` în prealabil.
 */
const db = process.env.E2E_DATABASE_URL || "postgres://postgres@localhost:5433/togato_e2e_test";
const apiEnv = {
  NODE_ENV: "development",
  DATABASE_URL: db,
  JWT_SECRET: "secret-e2e-suficient-de-lung-123456",
  ENCRYPTION_KEY: "a".repeat(64),
  FRONTEND_URL: "http://localhost:3091",
  RATE_LIMIT: "off",
  PORT: "8080",
};

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]] : "list",
  use: { baseURL: "http://localhost:3091", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    {
      command: "npm run db:migrate -w @togato/api && npm run start:dev -w @togato/api",
      cwd: "..",
      url: "http://localhost:8080/health",
      env: apiEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "cp -r .next/static .next/standalone/apps/web/.next/ && (cp -r public .next/standalone/apps/web/ 2>/dev/null || true) && PORT=3091 HOSTNAME=0.0.0.0 node .next/standalone/apps/web/server.js",
      cwd: "../apps/web",
      url: "http://localhost:3091/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
