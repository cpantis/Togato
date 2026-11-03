/** O dată pe rulare: baza de test e golită complet și migrată de la zero. */
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { testEnv } from "./env";

export default async function setup() {
  const env = testEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(sql), { migrationsFolder: path.resolve(__dirname, "../src/db/migrations") });
  await sql.end();
}
