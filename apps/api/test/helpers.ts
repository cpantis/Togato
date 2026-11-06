import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { selfAssessments, sessions, users } from "../src/db/schema";
import { hashToken } from "../src/lib/tokens";
/** Utilitare pentru testele de integrare: cereri către aplicația reală, fără server HTTP. */
import { app } from "../src/app";

export interface Res<T = any> { status: number; body: T; headers: Headers }

export async function call<T = any>(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await app.request(path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const type = res.headers.get("content-type") || "";
  const body = type.includes("json") ? await res.json() : await res.arrayBuffer();
  return { status: res.status, body: body as T, headers: res.headers };
}

/** confirmă direct emailul unei autoevaluări (în teste, fără a citi emailul) */
export async function verifySelfAssessment(token: string) {
  await db.update(selfAssessments).set({ emailVerifiedAt: new Date(), verifyTokenHash: null }).where(eq(selfAssessments.tokenHash, hashToken(token)));
}

/** încărcare multipart („file”, opțional „note”) */
export async function upload(path: string, token: string, filename: string, content: Buffer, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(content)], filename));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await app.request(path, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: (await res.json()) as any };
}

let seq = 0;
export const unique = (prefix: string) => `${prefix}${Date.now()}${++seq}`;

/** Creează un cabinet complet: administrator, un client, sisteme AI, obligații, aviz, portal, invitație. */
export async function seedCabinet(name: string) {
  const email = `${unique("admin")}@${name.toLowerCase().replace(/\W/g, "")}.ro`;
  const signup = await call("POST", "/api/auth/signup", { body: { name: `Admin ${name}`, email, password: "parola-sigura-1", cabinetName: name, acceptTerms: true } });
  if (signup.status !== 201) throw new Error(`signup: ${JSON.stringify(signup.body)}`);
  const token = signup.body.token as string;
  const userId = signup.body.user.id as string;
  const organizationId = signup.body.organization.id as string;
  // dacă testul cere confirmarea emailului, cabinetul de test a confirmat-o deja
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  const client = await call("POST", "/api/clients", { token, body: { name: `Client ${name} SRL` } });
  const clientId = client.body.id as string;
  const sys = await call("POST", `/api/clients/${clientId}/ai-systems`, {
    token, body: { name: "Filtrare CV", answers: { qualification: "da", annexIII: ["4a_recrutare", "5b_scoring_credit"], workplace: true, decisionsOnPersons: true } },
  });
  const systemId = sys.body.id as string;
  const obligationId = sys.body.obligations[0].id as string;
  await call("POST", `/api/ai-systems/${systemId}/review`, { token, body: { status: "aprobat" } });
  const snaps = await call("GET", `/api/ai-systems/${systemId}/snapshots`, { token });
  const snapshotId = snaps.body.data[0].id as string;
  const inv = await call("POST", "/api/team/invitations", { token, body: { email: `${unique("coleg")}@x.ro` } });
  const portal = await call("POST", `/api/clients/${clientId}/portal`, { token });
  const ev = await upload(`/api/obligations/${obligationId}/evidence`, token, "proces-verbal.pdf", Buffer.from("%PDF-1.4\n%dovadă de test\n"));
  if (ev.status !== 201) throw new Error(`evidence: ${JSON.stringify(ev.body)}`);
  // autoevaluarea unei firme, trimisă acestui cabinet (cabinetul apare în director)
  await call("PUT", "/api/organization/directory", { token, body: { listed: true, county: "Cluj", city: "Cluj-Napoca" } });
  const self = await call("POST", "/api/self-assessments", { body: { companyName: `Firma ${name} SRL`, contactName: "Ion Pop", contactEmail: `${unique("firma")}@firma.ro`, terms: true } });
  await verifySelfAssessment(self.body.token);
  await call("POST", `/api/self-assessments/${self.body.token}/tools`, { body: { name: "Chatbot site", answers: { talksToPeople: true } } });
  await call("POST", `/api/self-assessments/${self.body.token}/requests`, { body: { organizationId, consent: true } });
  const refs = await call("GET", "/api/referrals", { token });
  const referralId = refs.body.data[0]?.id as string;
  // GDPR: o activitate în registru, o cerere a unei persoane vizate, un incident
  const act = await call("POST", `/api/clients/${clientId}/processing`, { token, body: { name: "Salarizare", purpose: "Calculul și plata salariilor", legalBases: ["6_1_c"], dataCategories: ["identificare", "financiare"], subjectCategories: ["angajati"], retention: "50 de ani (Legea 16/1996)", securityMeasures: ["acces"] } });
  const dsar = await call("POST", `/api/clients/${clientId}/dsar`, { token, body: { type: "acces", requesterName: "Ana Popescu", receivedOn: new Date().toISOString().slice(0, 10) } });
  const br = await call("POST", `/api/clients/${clientId}/breaches`, { token, body: { title: "Laptop pierdut", discoveredAt: new Date(Date.now() - 3600_000).toISOString(), risk: "risc" } });
  if (act.status !== 201 || dsar.status !== 201 || br.status !== 201) throw new Error(`gdpr seed: ${JSON.stringify([act.body, dsar.body, br.body])}`);
  const [session] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).limit(1);
  return { token, userId, email, clientId, systemId, obligationId, snapshotId, invitationId: inv.body.id as string, portalUrl: portal.body.url as string, sessionId: session.id, evidenceId: ev.body.id as string, organizationId, referralId, selfToken: self.body.token as string, processingId: act.body.id as string, dsarId: dsar.body.id as string, breachId: br.body.id as string };
}
