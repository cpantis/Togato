/**
 * Autoevaluarea gratuită (publică, fără cont) și directorul cabinetelor.
 *   /api/self-assessments — creare, instrumente, rezultat, solicitări către cabinete (autentificat prin linkul secret)
 *   /api/directory        — cabinetele care au ales să apară în director (filtru pe județ, căutare după nume)
 * Rulează pe conexiunea de serviciu (fără RLS) și filtrează explicit.
 */
import { Hono } from "hono";
import { z } from "zod";
import crypto from "crypto";
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { JUDETE, buildSelfReport, normalizePortalAnswers, type SelfTool } from "@togato/shared";
import { rootDb as db } from "../db";
import { organizations, referrals, selfAssessments, users } from "../db/schema";
import { hashToken, newToken } from "../lib/tokens";
import { frontendBaseUrl } from "../config";
import { logoSrc } from "../lib/logo";
import { sendEmail, templates } from "../services/email";
import { stateOf } from "../services/billing";
import { cleanCui } from "../services/companyLookup";

export const selfAssessmentRoutes = new Hono();
export const directoryRoutes = new Hono();

const MAX_TOOLS = 30;
const MAX_REQUESTS = 3;
const INVALID = { error: "Linkul autoevaluării nu mai este valabil." };
const optional = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

async function load(token: string | undefined) {
  if (!token || token.length < 20 || token.length > 100) return null;
  return (await db.query.selfAssessments.findFirst({ where: eq(selfAssessments.tokenHash, hashToken(token)) })) ?? null;
}

const toolsOf = (row: typeof selfAssessments.$inferSelect) => (row.tools as SelfTool[]) ?? [];

/** cabinetele vizibile în director: listate și cu abonament activ sau în probă */
function listedWhere() {
  return and(eq(organizations.directoryListed, true), sql`${organizations.status} <> 'suspendat'`);
}

async function respond(row: typeof selfAssessments.$inferSelect) {
  const reqs = await db.select({ id: referrals.id, status: referrals.status, createdAt: referrals.createdAt, respondedAt: referrals.respondedAt, responseMessage: referrals.responseMessage, cabinetName: organizations.name, directoryEmail: organizations.directoryEmail, responderEmail: users.email, organizationId: organizations.id })
    .from(referrals).innerJoin(organizations, eq(organizations.id, referrals.organizationId))
    .leftJoin(users, eq(users.id, referrals.respondedBy))
    .where(eq(referrals.selfAssessmentId, row.id)).orderBy(asc(referrals.createdAt));
  return {
    companyName: row.companyName, cui: row.cui, county: row.county, contactName: row.contactName, contactEmail: row.contactEmail,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    report: buildSelfReport(toolsOf(row)),
    requests: reqs.map((r) => ({
      id: r.id, organizationId: r.organizationId, cabinetName: r.cabinetName, status: r.status, createdAt: r.createdAt.toISOString(),
      respondedAt: r.respondedAt?.toISOString() ?? null, responseMessage: r.responseMessage,
      // după acceptare, firma vede adresa de contact a cabinetului (din director sau a avocatului care a acceptat)
      cabinetEmail: r.status === "acceptat" ? (r.directoryEmail ?? r.responderEmail ?? null) : null,
    })),
    maxRequests: MAX_REQUESTS,
  };
}

const companySchema = z.object({
  companyName: z.string().trim().min(2, "Denumirea firmei e obligatorie").max(300),
  cui: z.string().trim().max(20).nullish().transform((v) => (v ? cleanCui(v) || null : null)),
  county: z.enum(JUDETE).nullish().transform((v) => v ?? null),
  contactName: z.string().trim().min(2, "Numele persoanei de contact e obligatoriu").max(200),
  contactEmail: z.string().trim().toLowerCase().email("Email invalid").max(200),
});

/** POST / — începe o autoevaluare; linkul secret se întoarce o dată și se trimite pe email */
selfAssessmentRoutes.post("/", async (c) => {
  const body = companySchema.extend({
    terms: z.literal(true, { message: "Confirmați că ați citit informarea" }),
    // câmp-capcană pentru roboți (ascuns în formular)
    website: z.string().max(0).optional(),
  }).parse(await c.req.json());
  const { token, hash } = newToken();
  const url = `${frontendBaseUrl()}/autoevaluare/${token}`;
  await db.transaction(async (tx) => {
    await tx.insert(selfAssessments).values({ tokenHash: hash, companyName: body.companyName, cui: body.cui, county: body.county, contactName: body.contactName, contactEmail: body.contactEmail });
    await sendEmail(templates.selfAssessmentLink({ to: body.contactEmail, name: body.contactName, companyName: body.companyName, url }), { tx });
  });
  return c.json({ token, url }, 201);
});

selfAssessmentRoutes.get("/:token", async (c) => {
  const row = await load(c.req.param("token"));
  if (!row) return c.json(INVALID, 404);
  return c.json(await respond(row));
});

selfAssessmentRoutes.put("/:token", async (c) => {
  const row = await load(c.req.param("token"));
  if (!row) return c.json(INVALID, 404);
  const body = companySchema.parse(await c.req.json());
  const [updated] = await db.update(selfAssessments).set({ ...body, updatedAt: new Date() }).where(eq(selfAssessments.id, row.id)).returning();
  return c.json(await respond(updated));
});

const toolSchema = z.object({
  name: z.string().trim().min(2, "Numele instrumentului e obligatoriu").max(200),
  vendor: optional(200),
  purpose: optional(1000),
  answers: z.record(z.string(), z.unknown()).default({}),
});

selfAssessmentRoutes.post("/:token/tools", async (c) => {
  const row = await load(c.req.param("token"));
  if (!row) return c.json(INVALID, 404);
  const body = toolSchema.parse(await c.req.json());
  const tools = toolsOf(row);
  if (tools.length >= MAX_TOOLS) return c.json({ error: `Maximum ${MAX_TOOLS} de instrumente.` }, 400);
  const tool: SelfTool = { id: crypto.randomUUID(), name: body.name, vendor: body.vendor, purpose: body.purpose, answers: normalizePortalAnswers(body.answers as never) };
  const [updated] = await db.update(selfAssessments).set({ tools: [...tools, tool], updatedAt: new Date() }).where(eq(selfAssessments.id, row.id)).returning();
  return c.json(await respond(updated), 201);
});

selfAssessmentRoutes.delete("/:token/tools/:toolId", async (c) => {
  const row = await load(c.req.param("token"));
  if (!row) return c.json(INVALID, 404);
  const tools = toolsOf(row);
  const next = tools.filter((t) => t.id !== c.req.param("toolId"));
  if (next.length === tools.length) return c.json({ error: "Instrumentul nu a fost găsit" }, 404);
  const [updated] = await db.update(selfAssessments).set({ tools: next, updatedAt: new Date() }).where(eq(selfAssessments.id, row.id)).returning();
  return c.json(await respond(updated));
});

/** DELETE /:token — firma își șterge autoevaluarea (solicitările deja trimise rămân la cabinete) */
selfAssessmentRoutes.delete("/:token", async (c) => {
  const row = await load(c.req.param("token"));
  if (!row) return c.json(INVALID, 404);
  await db.delete(selfAssessments).where(eq(selfAssessments.id, row.id));
  return c.body(null, 204);
});

/**
 * POST /:token/requests { organizationId, message, consent } — trimite autoevaluarea cabinetului ales.
 * Cabinetul primește o copie a datelor de la acest moment, doar cu acordul explicit al firmei.
 */
selfAssessmentRoutes.post("/:token/requests", async (c) => {
  const row = await load(c.req.param("token"));
  if (!row) return c.json(INVALID, 404);
  const body = z.object({
    organizationId: z.string().uuid(),
    message: optional(2000),
    consent: z.literal(true, { message: "Confirmați că sunteți de acord cu transmiterea datelor către cabinet" }),
  }).parse(await c.req.json());
  const tools = toolsOf(row);
  if (!tools.length) return c.json({ error: "Adăugați cel puțin un instrument AI înainte de a trimite autoevaluarea." }, 400);
  const org = await db.query.organizations.findFirst({ where: and(eq(organizations.id, body.organizationId), listedWhere()) });
  if (!org || stateOf(org) === "expirat") return c.json({ error: "Cabinetul nu mai este disponibil în director." }, 404);
  const existing = await db.select({ organizationId: referrals.organizationId }).from(referrals).where(eq(referrals.selfAssessmentId, row.id));
  if (existing.some((e) => e.organizationId === org.id)) return c.json({ error: "Ați trimis deja autoevaluarea acestui cabinet." }, 409);
  if (existing.length >= MAX_REQUESTS) return c.json({ error: `Puteți trimite autoevaluarea la cel mult ${MAX_REQUESTS} cabinete.` }, 400);

  const report = buildSelfReport(tools);
  const payload = {
    company: { name: row.companyName, cui: row.cui, county: row.county },
    contact: { name: row.contactName, email: row.contactEmail },
    tools,
    summary: { counts: report.counts, needsLawyer: report.needsLawyer, verdicts: report.tools.map((t) => ({ id: t.id, verdict: t.result.verdict })) },
    sentAt: new Date().toISOString(),
  };
  const admins = await db.select({ email: users.email, notify: users.notifyPortal }).from(users)
    .where(and(eq(users.organizationId, org.id), eq(users.role, "admin"), eq(users.status, "activ")));
  await db.transaction(async (tx) => {
    const [ref] = await tx.insert(referrals).values({ organizationId: org.id, selfAssessmentId: row.id, payload, message: body.message }).returning({ id: referrals.id });
    const recipients = new Set([...admins.filter((a) => a.notify).map((a) => a.email), ...(org.directoryEmail ? [org.directoryEmail] : [])]);
    for (const to of recipients) {
      await sendEmail(templates.referralNew({ to, companyName: row.companyName, contactName: row.contactName, tools: tools.length, needsLawyer: report.needsLawyer, url: `${frontendBaseUrl()}/solicitari/${ref.id}`, message: body.message }), { tx, organizationId: org.id });
    }
  });
  return c.json(await respond(row), 201);
});

/** GET /api/directory?county=&search=&limit=&offset= */
directoryRoutes.get("/", async (c) => {
  const q = z.object({
    county: z.enum(JUDETE).optional(),
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
  }).parse({ county: c.req.query("county") || undefined, search: c.req.query("search") || undefined, limit: c.req.query("limit"), offset: c.req.query("offset") });
  const where = and(
    listedWhere(),
    sql`(${organizations.subscriptionStatus} in ('active', 'trialing', 'past_due') or ${organizations.status} = 'activ' or ${organizations.trialEndsAt} > now())`,
    q.county ? eq(organizations.directoryCounty, q.county) : undefined,
    q.search ? ilike(organizations.name, `%${q.search.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(organizations).where(where);
  const rows = await db.select().from(organizations).where(where).orderBy(asc(organizations.name)).limit(q.limit).offset(q.offset);
  return c.json({
    data: rows.map((o) => ({
      id: o.id, name: o.name, county: o.directoryCounty, city: o.directoryCity, description: o.directoryDescription,
      website: o.directoryWebsite, logoSrc: logoSrc(o), brandColor: o.brandColor,
    })),
    total, limit: q.limit, offset: q.offset,
  });
});

/** lista județelor care au cel puțin un cabinet în director (pentru filtrul din interfață) */
directoryRoutes.get("/counties", async (c) => {
  const rows = await db.selectDistinct({ county: organizations.directoryCounty }).from(organizations)
    .where(and(listedWhere(), inArray(organizations.directoryCounty, [...JUDETE])));
  return c.json({ data: rows.map((r) => r.county).filter(Boolean).sort((a, b) => a!.localeCompare(b!, "ro")) });
});
