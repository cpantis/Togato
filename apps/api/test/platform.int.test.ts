/** Consola platformei: acces restrâns, suspendare, probă, plan manual, acces de suport cu acord. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { rootDb } from "../src/db";
import { auditLog, sessions, users } from "../src/db/schema";
import { _resetConfig } from "../src/config";
import { call, seedCabinet } from "./helpers";

let OP: Awaited<ReturnType<typeof seedCabinet>>; // operatorul Togato
let C: Awaited<ReturnType<typeof seedCabinet>>;  // un cabinet client

beforeAll(async () => {
  OP = await seedCabinet("Togato Operare");
  C = await seedCabinet("Cabinet Client");
  process.env.PLATFORM_ADMIN_EMAILS = ` ${OP.email.toUpperCase()} , altcineva@togato.ro`;
  _resetConfig();
});
afterAll(() => { delete process.env.PLATFORM_ADMIN_EMAILS; _resetConfig(); });

const enable2fa = (userId: string) => rootDb.update(users).set({ totpEnabled: true }).where(eq(users.id, userId));

describe("consola platformei", () => {
  it("invizibilă pentru ceilalți; cere 2FA pentru operator", async () => {
    expect((await call("GET", "/api/platform/organizations", { token: C.token })).status).toBe(404);
    const no2fa = await call("GET", "/api/platform/organizations", { token: OP.token });
    expect(no2fa.status).toBe(403);
    expect(no2fa.body.code).toBe("2fa_required");
    expect((await call("GET", "/api/auth/me", { token: OP.token })).body.user.platformAdmin).toBe(true);
    expect((await call("GET", "/api/auth/me", { token: C.token })).body.user.platformAdmin).toBe(false);
  });

  it("lista cabinetelor cu indicatori", async () => {
    await enable2fa(OP.userId);
    const r = await call("GET", "/api/platform/organizations?search=Cabinet%20Client", { token: OP.token });
    expect(r.status).toBe(200);
    const row = r.body.data.find((o: any) => o.id === C.organizationId);
    expect(row).toMatchObject({ name: "Cabinet Client", billingState: "proba", users: 1, clients: 1, systems: 1, supportAccess: false });
  });

  it("suspendarea închide sesiunile și apare în jurnalul cabinetului; reactivarea", async () => {
    expect((await call("POST", `/api/platform/organizations/${C.organizationId}/suspend`, { token: OP.token, body: { reason: "x" } })).status).toBe(400);
    expect((await call("POST", `/api/platform/organizations/${C.organizationId}/suspend`, { token: OP.token, body: { reason: "Neplată repetată" } })).status).toBe(200);
    expect(await rootDb.select().from(sessions).where(eq(sessions.organizationId, C.organizationId))).toHaveLength(0);
    expect((await call("GET", "/api/dashboard", { token: C.token })).status).toBe(401);
    const login = await call("POST", "/api/auth/login", { body: { email: C.email, password: "parola-sigura-1" } });
    expect((await call("GET", "/api/dashboard", { token: login.body.token })).body.code).toBe("suspended");
    const logged = await rootDb.select().from(auditLog).where(and(eq(auditLog.organizationId, C.organizationId), eq(auditLog.action, "togato_suspend")));
    expect(logged[0].details).toMatchObject({ by: OP.email, reason: "Neplată repetată" });

    await call("POST", `/api/platform/organizations/${C.organizationId}/unsuspend`, { token: OP.token });
    expect((await call("GET", "/api/dashboard", { token: login.body.token })).status).toBe(200);
    C.token = login.body.token;
  });

  it("prelungirea probei și planul acordat manual", async () => {
    const t = await call("POST", `/api/platform/organizations/${C.organizationId}/trial`, { token: OP.token, body: { days: 30 } });
    expect(new Date(t.body.trialEndsAt).getTime()).toBeGreaterThan(Date.now() + 40 * 86400_000);
    await call("POST", `/api/platform/organizations/${C.organizationId}/plan`, { token: OP.token, body: { plan: "enterprise", active: true } });
    const b = await call("GET", "/api/billing", { token: C.token });
    expect(b.body).toMatchObject({ state: "activ", plan: "enterprise", limits: { maxClients: null, maxUsers: null } });
  });

  it("vederea de suport doar cu acordul cabinetului, retras oricând; fiecare consultare jurnalizată", async () => {
    const denied = await call("GET", `/api/platform/organizations/${C.organizationId}/support`, { token: OP.token });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("no_support_access");

    expect((await call("POST", "/api/organization/support-access", { token: C.token, body: { hours: 12 } })).status).toBe(400);
    const grant = await call("POST", "/api/organization/support-access", { token: C.token, body: { hours: 24 } });
    expect(grant.body.supportAccessUntil).toBeTruthy();
    const view = await call("GET", `/api/platform/organizations/${C.organizationId}/support`, { token: OP.token });
    expect(view.status).toBe(200);
    expect(view.body.clients.map((x: any) => x.id)).toContain(C.clientId);
    expect(view.body.systems.map((x: any) => x.id)).toContain(C.systemId);
    const seen = await rootDb.select().from(auditLog).where(and(eq(auditLog.organizationId, C.organizationId), eq(auditLog.action, "togato_support_view")));
    expect(seen.length).toBe(1);

    await call("DELETE", "/api/organization/support-access", { token: C.token });
    expect((await call("GET", `/api/platform/organizations/${C.organizationId}/support`, { token: OP.token })).status).toBe(403);

    const audit = await call("GET", "/api/platform/audit", { token: OP.token });
    expect(audit.body.data.map((a: any) => a.action)).toEqual(expect.arrayContaining(["suspend", "unsuspend", "trial_extend", "plan_manual", "support_view"]));
  });

  it("un membru (nu administrator) al cabinetului nu poate acorda acces de suport", async () => {
    // seedCabinet creează doar administratori; verificăm direct că ruta cere rol de admin
    await rootDb.update(users).set({ role: "membru" }).where(eq(users.id, C.userId));
    expect((await call("POST", "/api/organization/support-access", { token: C.token, body: { hours: 24 } })).status).toBe(403);
    await rootDb.update(users).set({ role: "admin" }).where(eq(users.id, C.userId));
  });
});
