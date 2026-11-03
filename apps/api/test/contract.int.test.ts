/** Răspunsurile reale ale API-ului respectă exact tipurile folosite de interfața web. */
import { beforeAll, describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
import * as C from "./contracts";
import { call, seedCabinet } from "./helpers";

let A: Awaited<ReturnType<typeof seedCabinet>>;

beforeAll(async () => {
  A = await seedCabinet("Contract");
  // un sistem din portal, ca să acopere și câmpurile de portal
  const token = A.portalUrl.split("/portal/")[1];
  await call("POST", `/api/portal/${token}/systems`, { body: { name: "Asistent vocal", contactName: "Ion Pop", contactEmail: "ion@client.ro", answers: { biometrics: true } } });
});

function check(schema: ZodTypeAny, body: unknown) {
  const r = schema.safeParse(body);
  if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}${"keys" in i ? ` (${(i as { keys: string[] }).keys.join(", ")})` : ""}`).join("\n"));
}

describe("contractul API", () => {
  it.each([
    ["/api/auth/me", "me"],
    ["/api/organization", "organization"],
    ["/api/clients", "clientPage"],
    ["/api/dashboard", "dashboard"],
    ["/api/team", "team"],
    ["/api/legislation", "legislation"],
  ] as const)("GET %s", async (path, schema) => {
    const r = await call("GET", path, { token: A.token });
    expect(r.status).toBe(200);
    check(C[schema], r.body);
  });

  it("GET /api/clients/:id (cu sisteme, obligații, sistem din portal)", async () => {
    const r = await call("GET", `/api/clients/${A.clientId}`, { token: A.token });
    check(C.clientDetail, r.body);
    expect(r.body.aiSystems.some((s: any) => s.source === "portal")).toBe(true);
  });

  it("GET /api/ai-systems/:id", async () => {
    const r = await call("GET", `/api/ai-systems/${A.systemId}`, { token: A.token });
    expect(r.status).toBe(200);
    check(C.systemDetail, r.body);
    expect(r.body.obligations.length).toBeGreaterThan(0);
  });

  it("GET /api/clients/:id/portal și portalul public", async () => {
    check(C.portalLink, (await call("GET", `/api/clients/${A.clientId}/portal`, { token: A.token })).body);
    const token = A.portalUrl.split("/portal/")[1];
    check(C.portal, (await call("GET", `/api/portal/${token}`)).body);
  });

  it("PATCH /api/obligations/:id întoarce obligația", async () => {
    const r = await call("PATCH", `/api/obligations/${A.obligationId}`, { token: A.token, body: { status: "in_lucru", dueDate: "2031-01-31" } });
    check(C.obligation, r.body);
  });

  it("textul legii: răspuns + cache cu ETag (304)", async () => {
    const r = await call("GET", `/api/law?ref=${encodeURIComponent("Art. 26(2)")}`, { token: A.token });
    expect(r.status).toBe(200);
    const etag = r.headers.get("etag")!;
    expect(etag).toMatch(/^W\/"law-/);
    const again = await call("GET", `/api/law?ref=${encodeURIComponent("Art. 26(2)")}`, { token: A.token, headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
  });

  it("paginarea clienților", async () => {
    for (let i = 0; i < 4; i++) await call("POST", "/api/clients", { token: A.token, body: { name: `Pagina ${i} SRL` } });
    const p1 = await call("GET", "/api/clients?limit=2&offset=0", { token: A.token });
    const p2 = await call("GET", "/api/clients?limit=2&offset=2", { token: A.token });
    check(C.clientPage, p1.body);
    expect(p1.body.total).toBe(5);
    expect(p1.body.data).toHaveLength(2);
    const ids = [...p1.body.data, ...p2.body.data].map((c: any) => c.id);
    expect(new Set(ids).size).toBe(4);
    expect((await call("GET", "/api/clients?limit=500", { token: A.token })).status).toBe(400);
  });
});
