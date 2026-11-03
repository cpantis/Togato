/** Row-Level Security: baza de date însăși separă cabinetele, independent de filtrele din cod. */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, rootDb, withTenant, withoutTenant } from "../src/db";
import { clients } from "../src/db/schema";
import { seedCabinet } from "./helpers";

/** mesajul Postgres (Drizzle îl împachetează în `cause`) */
async function pgError(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { return String((e as { cause?: Error }).cause?.message ?? (e as Error).message); }
  return "fără eroare";
}

let A: Awaited<ReturnType<typeof seedCabinet>>;
let B: Awaited<ReturnType<typeof seedCabinet>>;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  A = await seedCabinet("RLS Alfa");
  B = await seedCabinet("RLS Beta");
  const rows = await rootDb.execute<{ id: string; organization_id: string }>(sql`select id, organization_id from clients where id in (${A.clientId}, ${B.clientId})`);
  const list = rows as unknown as { id: string; organization_id: string }[];
  orgA = list.find((r) => r.id === A.clientId)!.organization_id;
  orgB = list.find((r) => r.id === B.clientId)!.organization_id;
});

describe("Row-Level Security", () => {
  it("fiecare tabel cu organization_id are RLS activ și o politică pentru togato_app", async () => {
    const rows = await rootDb.execute<{ table_name: string; rls: boolean; policies: number }>(sql`
      select c.table_name, cl.relrowsecurity as rls,
        (select count(*)::int from pg_policies p where p.tablename = c.table_name and 'togato_app' = any(p.roles)) as policies
      from information_schema.columns c
      join pg_class cl on cl.relname = c.table_name and cl.relkind = 'r'
      where c.table_schema = 'public' and c.column_name = 'organization_id'`);
    const missing = (rows as unknown as { table_name: string; rls: boolean; policies: number }[])
      .filter((r) => !r.rls || r.policies < 1).map((r) => r.table_name);
    expect(missing, "tabele noi fără RLS: adăugați politica într-o migrație").toEqual([]);
    const orgs = await rootDb.execute<{ rls: boolean }>(sql`select relrowsecurity as rls from pg_class where relname = 'organizations'`);
    expect((orgs as unknown as { rls: boolean }[])[0].rls).toBe(true);
  });

  it("o interogare fără filtru vede doar cabinetul curent", async () => {
    const seen = await withTenant(orgA, () => db.select({ id: clients.id, org: clients.organizationId }).from(clients));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((r) => r.org === orgA)).toBe(true);
    expect(seen.some((r) => r.id === B.clientId)).toBe(false);
  });

  it("nu se pot modifica, șterge sau insera rânduri ale altui cabinet", async () => {
    const updated = await withTenant(orgA, () => db.execute(sql`update clients set name = 'compromis' where id = ${B.clientId} returning id`));
    expect((updated as unknown as unknown[]).length).toBe(0);
    const deleted = await withTenant(orgA, () => db.execute(sql`delete from clients where id = ${B.clientId} returning id`));
    expect((deleted as unknown as unknown[]).length).toBe(0);
    expect(await pgError(withTenant(orgA, () => db.insert(clients).values({ organizationId: orgB, name: "Infiltrat SRL" })))).toMatch(/row-level security/);
    const still = await rootDb.execute<{ name: string }>(sql`select name from clients where id = ${B.clientId}`);
    expect((still as unknown as { name: string }[])[0].name).not.toBe("compromis");
  });

  it("fără app.org_id, rolul restrâns nu vede nimic (fail-closed)", async () => {
    expect(await pgError(rootDb.transaction(async (tx) => {
      await tx.execute(sql`set local role togato_app`);
      await tx.execute(sql`select count(*) from clients`);
    }))).toMatch(/app\.org_id|invalid input syntax for type uuid/);
  });

  it("tabelele fără cabinet (resetări de parolă) sunt inaccesibile cererilor", async () => {
    expect(await pgError(withTenant(orgA, () => db.execute(sql`select count(*) from password_resets`)))).toMatch(/permission denied/);
  });

  it("withoutTenant iese din context (doar pentru verificări la nivel de platformă)", async () => {
    const both = await withTenant(orgA, () => withoutTenant(() => db.execute(sql`select count(distinct organization_id)::int as n from clients where id in (${A.clientId}, ${B.clientId})`)));
    expect((both as unknown as { n: number }[])[0].n).toBe(2);
  });

  it("o eroare în cerere anulează modificările deja făcute (tranzacție per cerere)", async () => {
    // PUT cu date invalide după o modificare? simulăm direct: insert + eroare în același context
    await expect(withTenant(orgA, async () => {
      await db.insert(clients).values({ organizationId: orgA, name: "Anulat SRL" });
      throw new Error("eșec după scriere");
    })).rejects.toThrow("eșec");
    const rows = await rootDb.execute(sql`select 1 from clients where name = 'Anulat SRL'`);
    expect((rows as unknown as unknown[]).length).toBe(0);
  });
});
