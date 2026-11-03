import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { sessions } from "../src/db/schema";
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

let seq = 0;
export const unique = (prefix: string) => `${prefix}${Date.now()}${++seq}`;

/** Creează un cabinet complet: administrator, un client, sisteme AI, obligații, aviz, portal, invitație. */
export async function seedCabinet(name: string) {
  const email = `${unique("admin")}@${name.toLowerCase().replace(/\W/g, "")}.ro`;
  const signup = await call("POST", "/api/auth/signup", { body: { name: `Admin ${name}`, email, password: "parola-sigura-1", cabinetName: name } });
  if (signup.status !== 201) throw new Error(`signup: ${JSON.stringify(signup.body)}`);
  const token = signup.body.token as string;
  const userId = signup.body.user.id as string;
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
  const [session] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).limit(1);
  return { token, userId, email, clientId, systemId, obligationId, snapshotId, invitationId: inv.body.id as string, portalUrl: portal.body.url as string, sessionId: session.id };
}
