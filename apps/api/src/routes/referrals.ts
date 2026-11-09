/**
 * Solicitările primite de cabinet din autoevaluările firmelor (/api/referrals).
 * Acceptarea creează clientul și instrumentele lui (sursa „autoevaluare”), cu încadrarea
 * propusă automat — avocatul o verifică exact ca pentru orice alt sistem.
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { RULESET_VERSION, assessTool, classifyAiSystem, portalToAnswers, type PortalAnswers, type SelfTool } from "@togato/shared";
import { db } from "../db";
import { aiSystems, clients, organizations, referrals } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { notFound, uuidParam } from "../lib/http";
import { assertCanAdd } from "../services/billing";
import { sendEmail, templates } from "../services/email";
import { syncClientObligations, syncSystemObligations } from "../services/obligationsSync";

export const referralRoutes = new Hono<AppEnv>();

interface Payload {
  company: { name: string; cui: string | null; county: string | null };
  contact: { name: string; email: string };
  tools: SelfTool[];
  summary: { counts: Record<string, number>; needsLawyer: boolean };
  sentAt: string;
}

function serialize(r: typeof referrals.$inferSelect) {
  const p = r.payload as Payload;
  return {
    id: r.id, status: r.status, createdAt: r.createdAt.toISOString(), respondedAt: r.respondedAt?.toISOString() ?? null,
    message: r.message, responseMessage: r.responseMessage, clientId: r.clientId, conflictCheckedAt: r.conflictCheckedAt?.toISOString() ?? null,
    company: p.company, contact: p.contact, needsLawyer: p.summary.needsLawyer,
    tools: p.tools.map((t) => ({ ...t, result: assessTool(t.answers) })),
  };
}

async function loadReferral(organizationId: string, id: string) {
  const row = await db.query.referrals.findFirst({ where: and(eq(referrals.id, id), eq(referrals.organizationId, organizationId)) });
  if (!row) notFound("Solicitarea nu a fost găsită");
  return row;
}

referralRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const status = z.enum(["nou", "acceptat", "respins"]).optional().parse(c.req.query("status") || undefined);
  const rows = await db.select().from(referrals)
    .where(and(eq(referrals.organizationId, auth.organizationId), status ? eq(referrals.status, status) : undefined))
    .orderBy(desc(referrals.createdAt)).limit(200);
  const [{ pending }] = await db.select({ pending: sql<number>`count(*)::int` }).from(referrals)
    .where(and(eq(referrals.organizationId, auth.organizationId), eq(referrals.status, "nou")));
  return c.json({ data: rows.map(serialize), pending });
});

referralRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");
  return c.json(serialize(await loadReferral(auth.organizationId, uuidParam(c.req.param("id")))));
});

/** POST /:id/accept { message? } — firma devine client, cu instrumentele din autoevaluare */
referralRoutes.post("/:id/accept", async (c) => {
  const auth = c.get("auth");
  const row = await loadReferral(auth.organizationId, uuidParam(c.req.param("id")));
  // blocarea rândului: două răspunsuri simultane la aceeași solicitare nu pot trece amândouă
  const [locked] = await db.select({ status: referrals.status }).from(referrals).where(and(eq(referrals.id, row.id), eq(referrals.organizationId, auth.organizationId))).for("update");
  if (locked?.status !== "nou") return c.json({ error: "Solicitarea a primit deja un răspuns." }, 409);
  const { message, conflictChecked, conflictNote } = z.object({
    message: z.string().trim().max(2000).nullish(),
    // obligația deontologică: verificarea conflictului de interese înainte de a accepta clientul
    conflictChecked: z.literal(true, { message: "Confirmați că ați verificat conflictul de interese înainte de a accepta clientul." }),
    conflictNote: z.string().trim().max(2000).nullish(),
  }).parse(await c.req.json().catch(() => ({})));
  await assertCanAdd(auth.organizationId, "client");
  const p = row.payload as Payload;
  // același CUI există deja la cabinet → instrumentele se adaugă la clientul existent
  const existing = p.company.cui
    ? await db.query.clients.findFirst({ where: and(eq(clients.organizationId, auth.organizationId), eq(clients.cui, p.company.cui)) })
    : undefined;
  const org = (await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId) }))!;

  const clientId = await db.transaction(async (tx) => {
    const client = existing ?? (await tx.insert(clients).values({
      organizationId: auth.organizationId, name: p.company.name, cui: p.company.cui, county: p.company.county,
      contactName: p.contact.name, contactEmail: p.contact.email, responsibleUserId: auth.userId, createdBy: auth.userId,
      notes: row.message ? `Mesajul firmei la solicitare: ${row.message}` : null,
    }).returning())[0];
    for (const t of p.tools) {
      const answers = portalToAnswers(t.answers);
      const classification = classifyAiSystem(answers);
      const [sys] = await tx.insert(aiSystems).values({
        organizationId: auth.organizationId, clientId: client.id, name: t.name, vendor: t.vendor, purpose: t.purpose,
        answers, riskLevel: classification.riskLevel, classification, source: "autoevaluare", rulesetVersion: RULESET_VERSION,
        portalAnswers: t.answers as PortalAnswers, submittedByName: p.contact.name, submittedByEmail: p.contact.email, createdBy: auth.userId,
      }).returning({ id: aiSystems.id });
      await syncSystemObligations(tx, { organizationId: auth.organizationId, clientId: client.id, aiSystemId: sys.id, templates: classification.obligations });
    }
    await syncClientObligations(tx, auth.organizationId, client.id);
    await tx.update(referrals).set({ status: "acceptat", clientId: client.id, responseMessage: message ?? null, respondedBy: auth.userId, respondedAt: new Date(), conflictCheckedAt: new Date(), conflictNote: conflictNote ?? null })
      .where(and(eq(referrals.id, row.id), eq(referrals.organizationId, auth.organizationId)));
    await sendEmail(templates.referralAnswered({ to: p.contact.email, companyName: p.company.name, cabinetName: org.name, accepted: true, message, cabinetEmail: org.directoryEmail ?? auth.email }), { tx, organizationId: auth.organizationId });
    await audit(auth, "referral_accept", "client", client.id, { referralId: row.id, tools: p.tools.length, existingClient: !!existing, conflictChecked: true, conflictNote: conflictNote ?? null }, tx);
    return client.id;
  });
  return c.json({ ...serialize({ ...row, status: "acceptat", clientId, responseMessage: message ?? null, respondedAt: new Date() }), clientId });
});

/** POST /:id/decline { message? } — firma e anunțată și poate alege alt cabinet */
referralRoutes.post("/:id/decline", async (c) => {
  const auth = c.get("auth");
  const row = await loadReferral(auth.organizationId, uuidParam(c.req.param("id")));
  // blocarea rândului: două răspunsuri simultane la aceeași solicitare nu pot trece amândouă
  const [locked] = await db.select({ status: referrals.status }).from(referrals).where(and(eq(referrals.id, row.id), eq(referrals.organizationId, auth.organizationId))).for("update");
  if (locked?.status !== "nou") return c.json({ error: "Solicitarea a primit deja un răspuns." }, 409);
  const { message } = z.object({ message: z.string().trim().max(2000).nullish() }).parse(await c.req.json().catch(() => ({})));
  const p = row.payload as Payload;
  const org = (await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId) }))!;
  const [updated] = await db.update(referrals).set({ status: "respins", responseMessage: message ?? null, respondedBy: auth.userId, respondedAt: new Date() })
    .where(and(eq(referrals.id, row.id), eq(referrals.organizationId, auth.organizationId))).returning();
  await sendEmail(templates.referralAnswered({ to: p.contact.email, companyName: p.company.name, cabinetName: org.name, accepted: false, message }), { organizationId: auth.organizationId });
  await audit(auth, "referral_decline", "referral", row.id);
  return c.json(serialize(updated));
});
