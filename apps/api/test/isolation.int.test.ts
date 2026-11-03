/**
 * Separarea datelor între cabinete — verificată AUTOMAT pe toate rutele aplicației.
 * Un utilizator din cabinetul B încearcă fiecare rută cu identificatorii cabinetului A.
 * Dacă apare o rută nouă cu un parametru pe care testul nu-l cunoaște, testul pică intenționat.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { call, seedCabinet } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedCabinet>>;
let A: Seed;
let B: Seed;

const PUBLIC = [/^\/health(\/ready)?$/, /^\/api\/auth\//, /^\/api\/portal\//, /^\/api\/public\//, /^\/api\/stripe\//, /^\/api\/self-assessment/, /^\/api\/directory/];

/** Corpuri valide, ca refuzul să vină din verificarea cabinetului, nu din validare. */
function bodyFor(method: string, path: string, b: Seed): unknown {
  const key = `${method} ${path}`;
  const bodies: Record<string, unknown> = {
    "POST /api/clients/:clientId/ai-systems": { name: "Sistem străin", answers: {} },
    "PUT /api/clients/:id": { name: "Client modificat" },
    "PATCH /api/clients/:id/responsible": { userId: b.userId },
    "PUT /api/ai-systems/:id": { name: "Sistem modificat", answers: {} },
    "POST /api/ai-systems/:id/review": { status: "aprobat" },
    "POST /api/ai-systems/:id/override": { riskLevel: "minim", reason: "motivare suficient de lungă" },
    "PATCH /api/obligations/:id": { status: "indeplinit" },
    "PATCH /api/team/members/:id": { role: "membru" },
  };
  return bodies[key];
}

function resolveParams(path: string, a: Seed): string | null {
  let unknown = false;
  const out = path.replace(/:([A-Za-z]+)/g, (_m, name: string) => {
    if (name === "clientId") return a.clientId;
    if (name === "type") return "raport";
    if (name === "id") {
      if (path.startsWith("/api/clients/")) return a.clientId;
      if (path.startsWith("/api/ai-systems/")) return a.systemId;
      if (path.startsWith("/api/obligations/")) return a.obligationId;
      if (path.startsWith("/api/snapshots/")) return a.snapshotId;
      if (path.startsWith("/api/team/invitations/")) return a.invitationId;
      if (path.startsWith("/api/team/members/")) return a.userId;
      if (path.startsWith("/api/account/sessions/")) return a.sessionId;
      if (path.startsWith("/api/evidence/")) return a.evidenceId;
      if (path.startsWith("/api/platform/organizations/")) return a.organizationId;
      if (path.startsWith("/api/referrals/")) return a.referralId;
      if (path.startsWith("/api/processing/")) return a.processingId;
      if (path.startsWith("/api/dsar/")) return a.dsarId;
      if (path.startsWith("/api/breaches/")) return a.breachId;
    }
    unknown = true;
    return "?";
  });
  return unknown ? null : out;
}

function protectedRoutes() {
  const seen = new Set<string>();
  const list: { method: string; path: string }[] = [];
  for (const r of app.routes) {
    if (r.method === "ALL" || r.path.includes("*") || PUBLIC.some((re) => re.test(r.path))) continue;
    const k = `${r.method} ${r.path}`;
    if (seen.has(k)) continue;
    seen.add(k);
    list.push({ method: r.method, path: r.path });
  }
  return list;
}

beforeAll(async () => {
  // memoriul trebuie să ajungă la verificarea sistemului (nu să fie oprit de lipsa cheii sau a consimțământului)
  process.env.ANTHROPIC_API_KEY = "cheie-de-test";
  A = await seedCabinet("Alfa");
  B = await seedCabinet("Beta");
  await call("PUT", "/api/organization", { token: B.token, body: { name: "Beta", aiEnabled: true } });
});

describe("separarea între cabinete", () => {
  it("lista rutelor protejate e citită din aplicație", () => {
    expect(protectedRoutes().length).toBeGreaterThan(30);
  });

  it("fiecare rută protejată cere autentificare", async () => {
    const failures: string[] = [];
    for (const r of protectedRoutes()) {
      const path = resolveParams(r.path, A) ?? r.path;
      const res = await call(r.method, path);
      if (res.status !== 401) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it("un cabinet nu poate citi sau modifica nimic din alt cabinet, pe nicio rută cu identificator", async () => {
    const unknownParams: string[] = [];
    const leaks: string[] = [];
    for (const r of protectedRoutes()) {
      if (!r.path.includes(":")) continue;
      const path = resolveParams(r.path, A);
      if (!path) { unknownParams.push(`${r.method} ${r.path}`); continue; }
      const res = await call(r.method, path, { token: B.token, body: bodyFor(r.method, r.path, B) });
      if (![403, 404].includes(res.status)) leaks.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(unknownParams, "rute noi: adăugați maparea parametrilor în resolveParams").toEqual([]);
    expect(leaks).toEqual([]);
  });

  it("datele cabinetului A au rămas neatinse", async () => {
    const client = await call("GET", `/api/clients/${A.clientId}`, { token: A.token });
    expect(client.status).toBe(200);
    expect(client.body.name).toBe("Client Alfa SRL");
    const sys = await call("GET", `/api/ai-systems/${A.systemId}`, { token: A.token });
    expect(sys.body.name).toBe("Filtrare CV");
    expect(sys.body.reviewStatus).toBe("aprobat");
    expect(sys.body.obligations.find((o: any) => o.id === A.obligationId).status).toBe("de_facut");
    const team = await call("GET", "/api/team", { token: A.token });
    expect(team.body.members[0].role).toBe("admin");
    expect(team.body.invitations.map((i: any) => i.id)).toContain(A.invitationId);
    const portal = await call("GET", `/api/clients/${A.clientId}/portal`, { token: A.token });
    expect(portal.body.active).toBe(true);
  });

  it("listele și agregatele unui cabinet nu conțin identificatori din alt cabinet", async () => {
    const aIds = [A.clientId, A.systemId, A.obligationId, A.snapshotId, A.invitationId, A.userId];
    for (const path of ["/api/clients", "/api/dashboard", "/api/team", "/api/legislation", "/api/organization", `/api/clients/${B.clientId}`, `/api/ai-systems/${B.systemId}`, `/api/clients/${B.clientId}/documents`]) {
      const res = await call("GET", path, { token: B.token });
      expect(res.status, path).toBe(200);
      const text = JSON.stringify(res.body);
      for (const id of aIds) expect(text.includes(id), `${path} conține ${id}`).toBe(false);
    }
  });

  it("portalul unui client nu poate atinge sistemele altui cabinet", async () => {
    const bToken = B.portalUrl.split("/").pop()!;
    const del = await call("DELETE", `/api/portal/${bToken}/systems/${A.systemId}`);
    expect(del.status).toBe(404);
    const view = await call("GET", `/api/portal/${bToken}`);
    expect(JSON.stringify(view.body).includes(A.systemId)).toBe(false);
  });
});
