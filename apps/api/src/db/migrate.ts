import "dotenv/config";
import path from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL nu e setat");
    process.exit(1);
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  // __dirname = src/db (tsx) sau dist/db (build); migrațiile SQL stau în src/db/migrations
  const folder = path.resolve(__dirname, "../../src/db/migrations");
  await migrate(drizzle(client), { migrationsFolder: folder });
  console.log("Migrații aplicate");
  await client.end();
}

main().catch((err) => {
  console.error("Migrarea a eșuat:", err);
  process.exit(1);
});
