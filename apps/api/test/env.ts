/** Variabilele de mediu pentru testele de integrare. */
export function testEnv() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Setați TEST_DATABASE_URL (ex. postgres://postgres@localhost:5433/togato_test) — baza de date e ștearsă la fiecare rulare.");
  if (!/test/i.test(url)) throw new Error("Din prudență, TEST_DATABASE_URL trebuie să conțină „test” în nume.");
  return {
    NODE_ENV: "test",
    DATABASE_URL: url,
    JWT_SECRET: "secret-de-test-pentru-integrare-123456",
    ENCRYPTION_KEY: "0".repeat(63) + "1",
    FRONTEND_URL: "http://localhost:3000",
    RATE_LIMIT: "off",
    EMAIL_PROVIDER: "log",
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_DIR: "./.storage-test",
  };
}
