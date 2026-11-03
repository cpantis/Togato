import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { AsyncLocalStorage } from "async_hooks";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  process.stderr.write(JSON.stringify({ level: "error", msg: "DATABASE_URL nu e setat" }) + "\n");
}

const client = postgres(process.env.DATABASE_URL || "postgres://togato:togato@localhost:5432/togato", {
  max: Number(process.env.DB_POOL_MAX || 20),
  idle_timeout: 30,
  connect_timeout: 10,
});

/**
 * Conexiunea „de serviciu” (proprietarul tabelelor): fără Row-Level Security. Folosită de worker,
 * migrații, rutele publice (autentificare, portal) și de puținele interogări care trebuie să vadă
 * peste cabinete (ex. „există deja un cont cu acest email?”).
 */
export const rootDb = drizzle(client, { schema });
export type Db = typeof rootDb;
export type Tx = Parameters<Parameters<typeof rootDb.transaction>[0]>[0];

/** Rolul restrâns sub care rulează cererile autentificate; politicile RLS se aplică lui. */
export const TENANT_ROLE = "togato_app";

const tenantStore = new AsyncLocalStorage<{ tx: Tx; organizationId: string }>();

/**
 * `db` = tranzacția cererii curente (dacă există), altfel conexiunea de serviciu.
 * Codul din rute folosește `db` ca înainte; în cererile autentificate, fiecare interogare
 * trece prin politicile RLS ale cabinetului (vezi `withTenant`).
 */
export const db: Db = new Proxy(rootDb, {
  get(target, prop, receiver) {
    const store = tenantStore.getStore();
    const base = (store ? store.tx : target) as object;
    const value = Reflect.get(base, prop, store ? base : receiver);
    return typeof value === "function" ? value.bind(base) : value;
  },
}) as Db;

export class RollbackSignal extends Error {}

/**
 * Rulează `fn` într-o tranzacție cu rolul `togato_app` și `app.org_id` = cabinetul:
 * Postgres însuși refuză rândurile altor cabinete, chiar dacă o interogare uită filtrul.
 * Dacă `fn` aruncă (sau semnalează eroare prin `RollbackSignal`), modificările se anulează.
 */
export async function withTenant<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  return rootDb.transaction(async (tx) => {
    // un singur drum la server: set_config('role', …, true) = SET LOCAL ROLE
    await tx.execute(sql`select set_config('app.org_id', ${organizationId}, true), set_config('role', ${TENANT_ROLE}, true)`);
    return tenantStore.run({ tx, organizationId }, fn);
  });
}

/** contextul de cabinet curent (null în afara unei cereri autentificate) */
export function currentTenant(): string | null {
  return tenantStore.getStore()?.organizationId ?? null;
}

/** iese din contextul cererii: interogarea vede toate cabinetele — folosiți doar cu motiv documentat */
export function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return tenantStore.exit(fn);
}

export async function closeDb() {
  await client.end({ timeout: 5 });
}
