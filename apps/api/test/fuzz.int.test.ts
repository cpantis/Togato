/**
 * Fuzzing pe toate rutele aplicației (inclusiv cele noi, automat): JSON stricat, tipuri greșite, texte uriașe,
 * caracterul NUL în fiecare câmp și în căutări, parametri de paginare absurzi. Orice 5xx e un defect —
 * în afară de dependențele externe indisponibile în teste (ANAF → 502, cheia AI lipsă → 503).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { rootDb } from "../src/db";
import { organizations, users } from "../src/db/schema";
import { seedCabinet } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedCabinet>>;
let A: Seed;

function resolve(path: string, a: Seed): string {
  return path.replace(/:([A-Za-z]+)/g, (_m, name: string) => {
    if (name === "clientId") return a.clientId;
    if (name === "type") return "raport";
    if (name === "token") return "x".repeat(43);
    if (name === "orgId") return a.organizationId;
    if (name === "id") {
      const map: [string, string][] = [["/api/clients/", a.clientId], ["/api/ai-systems/", a.systemId], ["/api/obligations/", a.obligationId], ["/api/snapshots/", a.snapshotId], ["/api/team/invitations/", a.invitationId], ["/api/team/members/", a.userId], ["/api/account/sessions/", a.sessionId], ["/api/evidence/", a.evidenceId], ["/api/platform/organizations/", a.organizationId], ["/api/referrals/", a.referralId], ["/api/processing/", a.processingId], ["/api/dsar/", a.dsarId], ["/api/breaches/", a.breachId]];
      for (const [p, v] of map) if (path.startsWith(p)) return v;
    }
    return "00000000-0000-0000-0000-000000000000";
  });
}

const NUL = "a\u0000b";
const sink = (a: Seed) => ({
  name: "Nume Test", title: "Titlu", description: "Descriere", purpose: "Scop", vendor: "Furnizor", department: "IT", notes: "note", note: "notă",
  message: "mesaj", email: "qa@exemplu.ro", contactName: "Ion Pop", contactEmail: "ion@exemplu.ro", companyName: "Firma SRL", cabinetName: "Cabinet",
  cui: "14399840", county: "Cluj", city: "Cluj-Napoca", requesterName: "Ana", receivedOn: "2026-11-01", discoveredAt: new Date().toISOString(),
  risk: "risc", retention: "5 ani", legalBases: ["6_1_c"], dataCategories: ["identificare"], subjectCategories: ["angajati"], securityMeasures: ["acces"],
  answers: { qualification: "da" }, status: "aprobat", reason: "motivare suficient de lungă pentru test", confirm: "x", userId: a.userId, userIds: [],
  riskLevel: "minim", type: "acces", role: "membru", years: 1, excluded: false, restricted: false, conflictChecked: true, consent: true, terms: true,
  listed: true, website: "https://exemplu.ro", hours: 24, version: "x", enabled: true, value: true, code: "123456", password: "parola-sigura-1",
  currentPassword: "parola-sigura-1", newPassword: "parola-noua-12345", token: "x".repeat(43), plan: "start", days: 7, reasonText: "motiv",
  answer: "raspuns", dueDate: "2026-12-01", responseSummary: "răspuns", outcome: "admis", tools: [], brandColor: "#7a1f3a", logoUrl: "https://exemplu.ro/l.png",
});

async function raw(method: string, path: string, body: string | undefined, token?: string, ctype = "application/json") {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = ctype;
  const res = await app.request(path, { method, headers, body });
  return res.status;
}

beforeAll(async () => {
  A = await seedCabinet("Fuzz QA");
  await rootDb.update(organizations).set({ aiEnabled: true }).where(eq(organizations.id, A.organizationId));
  await rootDb.update(users).set({ totpEnabled: false }).where(eq(users.id, A.userId));
});

describe("fuzz", () => {
  it("niciun 5xx pe nicio rută, cu date malformate", async () => {
    const routes = new Map<string, { method: string; path: string }>();
    for (const r of app.routes) if (r.method !== "ALL" && !r.path.includes("*")) routes.set(`${r.method} ${r.path}`, r);
    const bad: string[] = [];
    const s = sink(A);
    // rutele care distrug starea seed-ului se rulează la sfârșit
    const destructive = /logout|sessions|closure|password|members|delete|DELETE|archive|accept|decline|reset|2fa|totp|suspend/i;
    const list = [...routes.values()].sort((x, y) => Number(destructive.test(`${x.method} ${x.path}`)) - Number(destructive.test(`${y.method} ${y.path}`)));
    for (const r of list) {
      if (/logout|DELETE \/api\/account/.test(`${r.method} ${r.path}`)) continue;
      const p = resolve(r.path, A);
      const variants: [string, string | undefined, string?][] = r.method === "GET"
        ? [["q-neg", undefined], ["q-nan", undefined], ["q-nul", undefined], ["q-huge", undefined]]
        : [["json-broken", "{"], ["json-array", "[]"], ["json-null", "null"], ["json-num", "123"], ["text", "abc", "text/plain"], ["sink", JSON.stringify(s)],
           ["wrong-types", JSON.stringify(Object.fromEntries(Object.keys(s).map((k) => [k, { nested: [1] }])))],
           ["huge", JSON.stringify({ ...s, name: "x".repeat(200_000), description: "y".repeat(200_000) })],
           ...Object.keys(s).filter((k) => typeof (s as Record<string, unknown>)[k] === "string").map((k) => [`nul:${k}`, JSON.stringify({ ...s, [k]: NUL })] as [string, string])];
      for (const [name, body, ct] of variants) {
        let path = p;
        if (name === "q-neg") path += "?limit=-5&offset=-10&page=-1";
        if (name === "q-nan") path += "?limit=abc&offset=xyz&county=%25&search=%27%22&status=zzz&archived=maybe";
        if (name === "q-nul") path += "?search=a%00b&q=a%00b&county=a%00b&ref=a%00b&kind=a%00b";
        if (name === "q-huge") path += `?limit=99999999999999999999&offset=1e308&search=${"x".repeat(5000)}`;
        const st = await raw(r.method, path, body, A.token, ct);
        const external = (st === 502 && r.path === "/api/clients/lookup") || (st === 503 && r.path.endsWith("/memo"));
        if (st >= 500 && !external) bad.push(`${st} ${r.method} ${r.path} [${name}]`);
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);
});
