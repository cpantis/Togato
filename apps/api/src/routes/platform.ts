/**
 * Consola platformei (/api/platform) — doar pentru adresele din PLATFORM_ADMIN_EMAILS, cu 2FA activ.
 * Vede cabinetele și starea lor; datele unui cabinet (clienți, sisteme) se pot vedea DOAR cât timp
 * cabinetul a acordat acces de suport, doar în citire, și fiecare consultare e jurnalizată.
 */
import { Hono, type Context, type Next } from "hono";
import { z } from "zod";
import { desc, eq, ilike, sql } from "drizzle-orm";
import { PLANS } from "@togato/shared";
import { rootDb, withoutTenant } from "../db";
import { aiSystems, auditLog, clients, organizations, platformAuditLog, sessions, users } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { notFound, uuidParam } from "../lib/http";
import { isPlatformAdmin, platformAudit } from "../services/platform";
import { stateOf } from "../services/billing";

export const platformRoutes = new Hono<AppEnv>();

async function requirePlatformAdmin(c: Context<AppEnv>, next: Next) {
  const auth = c.get("auth");
  if (!isPlatformAdmin(auth.email)) return c.json({ error: "Ruta nu există" }, 404);
  const u = await withoutTenant(() => rootDb.query.users.findFirst({ where: eq(users.id, auth.userId), columns: { totpEnabled: true } }));
  if (!u?.totpEnabled) return c.json({ error: "Activați autentificarea în doi pași pentru a folosi consola platformei.", code: "2fa_required" }, 403);
  // tot ce urmează vede peste cabinete: ieșim din contextul RLS al cabinetului propriu
  await withoutTenant(() => next());
}

platformRoutes.use("*", requirePlatformAdmin);

const actor = (c: Context<AppEnv>) => ({ userId: c.get("auth").userId, email: c.get("auth").email });

async function loadOrg(id: string) {
  const org = await rootDb.query.organizations.findFirst({ where: eq(organizations.id, id) });
  if (!org) notFound("Cabinetul nu a fost găsit");
  return org;
}

/** GET /organizations?search=&limit=&offset= — cabinetele, cu indicatori de utilizare */
platformRoutes.get("/organizations", async (c) => {
  const { search, limit, offset } = z.object({
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse({ search: c.req.query("search") || undefined, limit: c.req.query("limit"), offset: c.req.query("offset") });
  const where = search ? ilike(organizations.name, `%${search}%`) : undefined;
  const [{ total }] = await rootDb.select({ total: sql<number>`count(*)::int` }).from(organizations).where(where);
  const rows = await rootDb.select({
    org: organizations,
    users: sql<number>`(select count(*)::int from users u where u.organization_id = "organizations"."id" and u.status = 'activ')`,
    clients: sql<number>`(select count(*)::int from clients cl where cl.organization_id = "organizations"."id" and cl.archived_at is null)`,
    systems: sql<number>`(select count(*)::int from ai_systems s where s.organization_id = "organizations"."id")`,
    lastActiveAt: sql<string | null>`(select max(u.last_active_at) from users u where u.organization_id = "organizations"."id")`,
  }).from(organizations).where(where).orderBy(desc(organizations.createdAt)).limit(limit).offset(offset);
  const now = new Date();
  return c.json({
    data: rows.map((r) => ({
      id: r.org.id, name: r.org.name, plan: r.org.plan, status: r.org.status, billingState: stateOf(r.org),
      trialEndsAt: r.org.trialEndsAt?.toISOString() ?? null, subscriptionStatus: r.org.subscriptionStatus,
      createdAt: r.org.createdAt.toISOString(), users: r.users, clients: r.clients, systems: r.systems,
      lastActiveAt: r.lastActiveAt ? new Date(r.lastActiveAt).toISOString() : null,
      suspendedReason: r.org.suspendedReason,
      supportAccess: !!r.org.supportAccessUntil && r.org.supportAccessUntil > now,
      supportAccessUntil: r.org.supportAccessUntil && r.org.supportAccessUntil > now ? r.org.supportAccessUntil.toISOString() : null,
    })),
    total, limit, offset,
  });
});

/** POST /organizations/:id/suspend { reason } — blochează accesul imediat (sesiunile se închid) */
platformRoutes.post("/organizations/:id/suspend", async (c) => {
  const org = await loadOrg(uuidParam(c.req.param("id")));
  const { reason } = z.object({ reason: z.string().trim().min(5, "Motivați suspendarea").max(1000) }).parse(await c.req.json());
  await rootDb.transaction(async (tx) => {
    await tx.update(organizations).set({ status: "suspendat", suspendedReason: reason }).where(eq(organizations.id, org.id));
    await tx.delete(sessions).where(eq(sessions.organizationId, org.id));
  });
  await platformAudit(c, actor(c), "suspend", org.id, { reason });
  return c.json({ ok: true });
});

platformRoutes.post("/organizations/:id/unsuspend", async (c) => {
  const org = await loadOrg(uuidParam(c.req.param("id")));
  // revine la „activ” doar dacă are un abonament plătit sau acordat; altfel la „trial” (starea reală o dă billingState)
  const status = org.subscriptionStatus === "active" || org.subscriptionStatus === "past_due" || org.plan === "enterprise" ? "activ" : "trial";
  await rootDb.update(organizations).set({ status, suspendedReason: null }).where(eq(organizations.id, org.id));
  await platformAudit(c, actor(c), "unsuspend", org.id, { status });
  return c.json({ ok: true });
});

/** POST /organizations/:id/trial { days } — prelungește perioada de probă de azi încolo */
platformRoutes.post("/organizations/:id/trial", async (c) => {
  const org = await loadOrg(uuidParam(c.req.param("id")));
  const { days } = z.object({ days: z.number().int().min(1).max(90) }).parse(await c.req.json());
  const base = org.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date();
  const trialEndsAt = new Date(base.getTime() + days * 86400_000);
  await rootDb.update(organizations).set({ trialEndsAt, ...(org.status === "activ" && !org.subscriptionStatus ? {} : { status: org.status === "suspendat" ? "suspendat" : "trial" }) })
    .where(eq(organizations.id, org.id));
  await platformAudit(c, actor(c), "trial_extend", org.id, { days, trialEndsAt: trialEndsAt.toISOString() });
  return c.json({ ok: true, trialEndsAt: trialEndsAt.toISOString() });
});

/** POST /organizations/:id/plan { plan, manual } — abonament acordat manual (ex. Enterprise, facturat separat) */
platformRoutes.post("/organizations/:id/plan", async (c) => {
  const org = await loadOrg(uuidParam(c.req.param("id")));
  const body = z.object({ plan: z.enum(PLANS.map((p) => p.code) as [string, ...string[]]), active: z.boolean() }).parse(await c.req.json());
  if (org.subscriptionStatus === "active" && body.active) {
    return c.json({ error: "Cabinetul are un abonament Stripe activ; planul se schimbă din Stripe." }, 409);
  }
  await rootDb.update(organizations).set({
    plan: body.plan,
    ...(org.status === "suspendat" ? {} : { status: body.active ? "activ" : "trial" }),
    ...(body.active ? { subscriptionStatus: null } : {}),
  }).where(eq(organizations.id, org.id));
  await platformAudit(c, actor(c), "plan_manual", org.id, body);
  return c.json({ ok: true });
});

/**
 * GET /organizations/:id/support — vederea de suport (doar citire): utilizatori, clienți, sisteme,
 * activitatea recentă. Permisă doar cât timp cabinetul a acordat acces; fiecare consultare se jurnalizează.
 */
platformRoutes.get("/organizations/:id/support", async (c) => {
  const org = await loadOrg(uuidParam(c.req.param("id")));
  if (!org.supportAccessUntil || org.supportAccessUntil <= new Date()) {
    return c.json({ error: "Cabinetul nu a acordat acces de suport. Administratorul cabinetului îl poate acorda din Setări → Securitate.", code: "no_support_access" }, 403);
  }
  const members = await rootDb.select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, totpEnabled: users.totpEnabled, lastActiveAt: users.lastActiveAt })
    .from(users).where(eq(users.organizationId, org.id));
  const clientRows = await rootDb.select({ id: clients.id, name: clients.name, cui: clients.cui, archivedAt: clients.archivedAt, systems: sql<number>`(select count(*)::int from ai_systems s where s.client_id = "clients"."id")` })
    .from(clients).where(eq(clients.organizationId, org.id)).orderBy(clients.name).limit(200);
  const systems = await rootDb.select({ id: aiSystems.id, clientId: aiSystems.clientId, name: aiSystems.name, riskLevel: aiSystems.riskLevel, reviewStatus: aiSystems.reviewStatus, rulesetVersion: aiSystems.rulesetVersion, aiMemoStatus: aiSystems.aiMemoStatus, aiMemoError: aiSystems.aiMemoError })
    .from(aiSystems).where(eq(aiSystems.organizationId, org.id)).limit(500);
  const activity = await rootDb.select({ at: auditLog.createdAt, action: auditLog.action, entity: auditLog.entity, user: users.name })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).where(eq(auditLog.organizationId, org.id)).orderBy(desc(auditLog.createdAt)).limit(50);
  await platformAudit(c, actor(c), "support_view", org.id);
  return c.json({
    organization: { id: org.id, name: org.name, plan: org.plan, billingState: stateOf(org), supportAccessUntil: org.supportAccessUntil.toISOString() },
    members: members.map((m) => ({ ...m, lastActiveAt: m.lastActiveAt?.toISOString() ?? null })),
    clients: clientRows.map((r) => ({ ...r, archivedAt: r.archivedAt?.toISOString() ?? null })),
    systems,
    activity: activity.map((a) => ({ ...a, at: a.at.toISOString() })),
  });
});

/** GET /audit — jurnalul acțiunilor echipei Togato */
platformRoutes.get("/audit", async (c) => {
  const rows = await rootDb.select({ log: platformAuditLog, orgName: organizations.name }).from(platformAuditLog)
    .leftJoin(organizations, eq(organizations.id, platformAuditLog.targetOrganizationId))
    .orderBy(desc(platformAuditLog.createdAt)).limit(200);
  return c.json({ data: rows.map((r) => ({ ...r.log, createdAt: r.log.createdAt.toISOString(), organizationName: r.orgName })) });
});

