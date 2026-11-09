/** Robustețe: cereri paralele (limite, unicitate), caractere și date invalide — defecte găsite la testarea QA. */
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { rootDb } from "../src/db";
import { aiSystems, clients, referrals } from "../src/db/schema";
import { app } from "../src/app";
import { call, seedCabinet, upload } from "./helpers";

const count = async (where: ReturnType<typeof and>) => (await rootDb.select({ n: sql<number>`count(*)::int` }).from(clients).where(where))[0].n;

describe("cereri paralele", () => {
  it("limita de clienți a probei nu se poate depăși prin cereri simultane", async () => {
    const A = await seedCabinet("Limita Paralel");
    const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => call("POST", "/api/clients", { token: A.token, body: { name: `Paralel ${i} SRL` } })));
    expect(rs.every((r) => r.status === 201 || r.status === 402)).toBe(true);
    expect(await count(and(eq(clients.organizationId, A.organizationId), eq(clients.isDemo, false), sql`archived_at is null`))).toBe(10);
  });

  it("clientul demonstrativ cerut simultan rămâne unul singur", async () => {
    const A = await seedCabinet("Demo Paralel");
    const rs = await Promise.all(Array.from({ length: 5 }, () => call("POST", "/api/clients/demo", { token: A.token })));
    expect(new Set(rs.map((r) => r.body.id)).size).toBe(1);
    expect(await count(and(eq(clients.organizationId, A.organizationId), eq(clients.isDemo, true)))).toBe(1);
  });

  it("aceeași solicitare acceptată simultan creează un singur client și o singură dată sistemele", async () => {
    const A = await seedCabinet("Accept Paralel");
    const rs = await Promise.all(Array.from({ length: 4 }, () => call("POST", `/api/referrals/${A.referralId}/accept`, { token: A.token, body: { conflictChecked: true } })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(3);
    const [ref] = await rootDb.select().from(referrals).where(eq(referrals.id, A.referralId));
    expect(ref.status).toBe("acceptat");
    expect(await rootDb.select().from(aiSystems).where(and(eq(aiSystems.organizationId, A.organizationId), eq(aiSystems.source, "autoevaluare")))).toHaveLength(1);
  });

  it("acceptarea și refuzul simultane: doar una reușește", async () => {
    const A = await seedCabinet("Accept Refuz Paralel");
    const [a, d] = await Promise.all([
      call("POST", `/api/referrals/${A.referralId}/accept`, { token: A.token, body: { conflictChecked: true } }),
      call("POST", `/api/referrals/${A.referralId}/decline`, { token: A.token, body: {} }),
    ]);
    expect([a.status, d.status].sort()).toEqual([200, 409]);
  });
});

describe("date invalide", () => {
  it("caracterul NUL în text sau în căutare → 400, nu 500", async () => {
    const A = await seedCabinet("NUL QA");
    const r1 = await call("POST", `/api/clients/${A.clientId}/ai-systems`, { token: A.token, body: { name: "a\u0000b", answers: {} } });
    expect(r1.status).toBe(400);
    expect(r1.body.code).toBe("invalid_characters");
    expect((await call("GET", "/api/clients?search=a%00b", { token: A.token })).status).toBe(400);
    // o bară inversă urmată de „u0000” e text obișnuit
    const ok = await call("POST", `/api/clients/${A.clientId}/ai-systems`, { token: A.token, body: { name: "Cale C:\\u0000 (text)", answers: {} } });
    expect(ok.status).toBe(201);
    // nota unei dovezi (multipart) nu poate strica cererea
    const ev = await upload(`/api/obligations/${A.obligationId}/evidence`, A.token, "x.pdf", Buffer.from("%PDF-1.4\n"), { note: "notă a\u0000b" });
    expect(ev.status).toBe(201);
    expect(ev.body.note).toBe("notă ab");
  });

  it("o dată inexistentă (30 februarie) e refuzată cu 400", async () => {
    const A = await seedCabinet("Data QA");
    const r = await call("POST", `/api/clients/${A.clientId}/dsar`, { token: A.token, body: { type: "acces", requesterName: "Ana", receivedOn: "2026-02-30" } });
    expect(r.status).toBe(400);
    expect((await call("PATCH", `/api/obligations/${A.obligationId}`, { token: A.token, body: { dueDate: "2026-04-31" } })).status).toBe(400);
    expect((await call("PATCH", `/api/obligations/${A.obligationId}`, { token: A.token, body: { dueDate: "2028-02-29" } })).status).toBe(200);
  });

  it("preferințele de notificare: un corp fără câmpuri nu strică cererea", async () => {
    const A = await seedCabinet("Notif QA");
    const r = await call("PUT", "/api/account/notifications", { token: A.token, body: {} });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ notifyDeadlines: true, notifyPortal: true });
  });

  it("JSON stricat → 400", async () => {
    const A = await seedCabinet("JSON QA");
    const res = await app.request("/api/clients", { method: "POST", headers: { authorization: `Bearer ${A.token}`, "content-type": "application/json" }, body: "{" });
    expect(res.status).toBe(400);
  });
});

describe("sesiunea curentă (/api/auth/me)", () => {
  it("vizitatorul fără sesiune primește 200 cu user null; un token invalid primește 401", async () => {
    const anon = await call("GET", "/api/auth/me");
    expect(anon.status).toBe(200);
    expect(anon.body).toEqual({ user: null, organization: null });
    expect((await call("GET", "/api/auth/me", { token: "token-inexistent" })).status).toBe(401);
    const stale = await app.request("/api/auth/me", { headers: { cookie: "togato_session=expirat" } });
    expect(stale.status).toBe(401);
    expect(stale.headers.get("set-cookie") ?? "").toMatch(/togato_session=;|togato_session=.*Max-Age=0/);
  });
});
