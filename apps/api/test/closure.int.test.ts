/** Închiderea contului de cabinet (export complet, perioadă de grație, ștergere) și păstrarea dosarelor arhivate. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { rootDb } from "../src/db";
import { auditLog, clients, jobs, organizations, users } from "../src/db/schema";
import { app } from "../src/app";
import { drain } from "../src/jobs/queue";
import { handlers } from "../src/jobs/handlers";
import { applyRetention, purgeClosedOrganizations, retentionDeleteOn } from "../src/services/closure";
import { _clearOutbox, sentEmails } from "../src/services/email";
import { call, seedCabinet } from "./helpers";

async function runJobs() {
  await rootDb.execute(sql`update jobs set run_at = now() where status = 'pending'`);
  await drain(handlers);
}
beforeEach(async () => { await runJobs(); _clearOutbox(); });

describe("exportul complet al cabinetului", () => {
  it("dosarul fiecărui client, echipa și jurnalul; doar pentru administratori", async () => {
    const A = await seedCabinet("Export Cabinet");
    await call("POST", "/api/clients", { token: A.token, body: { name: "Al doilea SRL" } });
    const res = await app.request("/api/organization/export", { headers: { authorization: `Bearer ${A.token}` } });
    expect(res.status).toBe(200);
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const names = Object.keys(files);
    expect(names).toEqual(expect.arrayContaining(["CITESTE-MA.txt", "cabinet.json", "echipa.csv", "jurnal_cabinet.csv"]));
    expect(names.filter((n) => n.startsWith("clienti/") && n.endsWith(".zip"))).toHaveLength(2);
    expect(JSON.parse(strFromU8(files["cabinet.json"])).clients).toHaveLength(2);
    const inner = unzipSync(files[names.find((n) => n.startsWith("clienti/") && n.toLowerCase().includes("export"))!]);
    expect(Object.keys(inner)).toContain("dosar.json");
  });
});

describe("închiderea contului", () => {
  it("confirmare cu numele, doar citire în perioada de grație, anulare", async () => {
    const A = await seedCabinet("Inchidere Cabinet");
    expect((await call("POST", "/api/organization/closure", { token: A.token, body: { confirm: "alt nume" } })).status).toBe(400);
    const r = await call("POST", "/api/organization/closure", { token: A.token, body: { confirm: "Inchidere Cabinet" } });
    expect(r.status).toBe(200);
    const days = (new Date(r.body.closureScheduledFor).getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(29.9);
    await runJobs();
    expect(sentEmails().some((m) => m.subject === "Închiderea contului Togato a fost programată")).toBe(true);

    const blocked = await call("POST", "/api/clients", { token: A.token, body: { name: "Nou SRL" } });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("closing");
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: A.token })).status).toBe(200);
    expect((await call("GET", "/api/auth/me", { token: A.token })).body.organization.closureScheduledFor).toBeTruthy();

    expect((await call("DELETE", "/api/organization/closure", { token: A.token })).status).toBe(200);
    expect((await call("POST", "/api/clients", { token: A.token, body: { name: "Nou SRL" } })).status).toBe(201);
  });

  it("cu abonament activ, cere anularea lui întâi", async () => {
    const A = await seedCabinet("Inchidere Abonat");
    await rootDb.update(organizations).set({ stripeSubscriptionId: "sub_x", subscriptionStatus: "active", status: "activ" }).where(eq(organizations.id, A.organizationId));
    const r = await call("POST", "/api/organization/closure", { token: A.token, body: { confirm: "Inchidere Abonat" } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("subscription_active");
  });

  it("la termen, cabinetul și toate datele lui se șterg; fișierele printr-un job", async () => {
    const A = await seedCabinet("Inchidere Finala");
    await call("POST", "/api/organization/closure", { token: A.token, body: { confirm: "Inchidere Finala" } });
    await rootDb.update(organizations).set({ closureScheduledFor: new Date(Date.now() - 1000) }).where(eq(organizations.id, A.organizationId));
    _clearOutbox();
    expect(await purgeClosedOrganizations()).toBe(1);
    expect(await rootDb.select().from(organizations).where(eq(organizations.id, A.organizationId))).toHaveLength(0);
    expect(await rootDb.select().from(users).where(eq(users.organizationId, A.organizationId))).toHaveLength(0);
    expect(await rootDb.select().from(clients).where(eq(clients.organizationId, A.organizationId))).toHaveLength(0);
    const del = await rootDb.select().from(jobs).where(and(eq(jobs.type, "storage.delete"), eq(jobs.status, "pending")));
    expect(del.some((j) => (j.payload as { keys: string[] }).keys.some((k) => k.startsWith(A.organizationId)))).toBe(true);
    expect((await call("GET", "/api/auth/me", { token: A.token })).status).toBe(401);
    await runJobs();
    expect(sentEmails().some((m) => m.subject === "Contul Togato a fost închis" && m.to === A.email)).toBe(true);
  });
});

describe("păstrarea dosarelor arhivate", () => {
  it("anunț cu 30 de zile înainte, apoi ștergere; jurnalizată", async () => {
    const A = await seedCabinet("Pastrare Cabinet");
    expect((await call("PUT", "/api/organization/retention", { token: A.token, body: { years: 4 } })).status).toBe(400);
    const p = await call("PUT", "/api/organization/retention", { token: A.token, body: { years: 1 } });
    expect(p.body.archivedRetentionYears).toBe(1);
    await call("POST", `/api/clients/${A.clientId}/archive`, { token: A.token });
    const archivedAt = new Date(Date.now() - 2 * 365 * 86400_000);
    await rootDb.update(clients).set({ archivedAt }).where(eq(clients.id, A.clientId));
    expect(retentionDeleteOn(archivedAt, 1).getTime()).toBeLessThan(Date.now());

    // prima rulare: doar anunțul, chiar dacă termenul a trecut (politica tocmai activată)
    expect(await applyRetention()).toBe(0);
    await runJobs();
    expect(sentEmails().some((m) => m.subject === "Dosare arhivate care vor fi șterse" && m.text.includes("Client Pastrare Cabinet SRL"))).toBe(true);
    expect(await applyRetention()).toBe(0);

    await rootDb.update(clients).set({ retentionWarnedAt: new Date(Date.now() - 31 * 86400_000) }).where(eq(clients.id, A.clientId));
    expect(await applyRetention()).toBe(1);
    expect(await rootDb.select().from(clients).where(eq(clients.id, A.clientId))).toHaveLength(0);
    const logRows = await rootDb.select().from(auditLog).where(and(eq(auditLog.organizationId, A.organizationId), eq(auditLog.action, "retention_delete")));
    expect(logRows).toHaveLength(1);
  });

  it("fără politică (implicit), dosarele arhivate se păstrează", async () => {
    const A = await seedCabinet("Pastrare Nelimitata");
    await call("POST", `/api/clients/${A.clientId}/archive`, { token: A.token });
    await rootDb.update(clients).set({ archivedAt: new Date(Date.now() - 20 * 365 * 86400_000), retentionWarnedAt: new Date(0) }).where(eq(clients.id, A.clientId));
    await applyRetention();
    expect(await rootDb.select().from(clients).where(eq(clients.id, A.clientId))).toHaveLength(1);
  });
});
