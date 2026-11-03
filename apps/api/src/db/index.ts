import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  process.stderr.write(JSON.stringify({ level: "error", msg: "DATABASE_URL nu e setat" }) + "\n");
}

const client = postgres(process.env.DATABASE_URL || "postgres://togato:togato@localhost:5432/togato", {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function closeDb() {
  await client.end({ timeout: 5 });
}
