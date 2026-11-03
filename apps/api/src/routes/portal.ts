/**
 * Portalul public al clientului — fără cont, accesat cu tokenul din link.
 * Clientul vede și adaugă instrumentele AI; nu vede încadrarea juridică.
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { RULESET_VERSION, classifyAiSystem, normalizePortalAnswers, portalToAnswers } from "@togato/shared";
import { db } from "../db";
import { aiSystems, auditLog, portalLinks } from "../db/schema";
import { resolvePortalToken } from "../lib/portalToken";
import { syncClientObligations, syncSystemObligations } from "../services/obligationsSync";
import { enqueue } from "../jobs/queue";
import { logoSrc } from "../lib/logo";

export const portalRoutes = new Hono();

const MAX_PORTAL_SYSTEMS = 100;
const INVALID = { error: "Linkul nu mai este valabil. Cereți cabinetului un link nou." };

async function touch(linkId: string) {
  await db.update(portalLinks).set({ lastUsedAt: new Date() }).where(eq(portalLinks.id, linkId)).catch(() => undefined);
}

async function portalAudit(organizationId: string, action: string, entityId: string | null, details: Record<string, unknown>) {
  await db.insert(auditLog).values({ organizationId, userId: null, action, entity: "portal", entityId, details }).catch(() => undefined);
}

portalRoutes.get("/:token", async (c) => {
  const found = await resolvePortalToken(c.req.param("token"));
  if (!found) return c.json(INVALID, 404);
  const { link, client, org } = found;
  await touch(link.id);
  const systems = await db.select({
    id: aiSystems.id, name: aiSystems.name, vendor: aiSystems.vendor, department: aiSystems.department,
    purpose: aiSystems.purpose, source: aiSystems.source, reviewStatus: aiSystems.reviewStatus, createdAt: aiSystems.createdAt,
  }).from(aiSystems).where(eq(aiSystems.clientId, client.id)).orderBy(desc(aiSystems.createdAt));

  return c.json({
    cabinet: { name: org.name, brandColor: org.brandColor, logoUrl: logoSrc(org) },
    client: { name: client.name },
    expiresAt: link.expiresAt.toISOString(),
    systems: systems.map((s) => ({
      id: s.id, name: s.name, vendor: s.vendor, department: s.department, purpose: s.purpose,
      addedBy: s.source === "portal" ? "client" : "cabinet",
      status: s.reviewStatus === "aprobat" ? "analizat" : "in_analiza",
      // clientul își poate retrage propriile instrumente cât timp cabinetul nu le-a analizat
      canDelete: s.source === "portal" && s.reviewStatus !== "aprobat",
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

const submitSchema = z.object({
  name: z.string().trim().min(2, "Numele instrumentului e obligatoriu").max(200),
  vendor: optionalText(200),
  department: optionalText(200),
  purpose: optionalText(2000),
  description: optionalText(5000),
  contactName: z.string().trim().min(2, "Spuneți-ne cine completează").max(200),
  contactEmail: z.string().trim().email("Email invalid").max(200).nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  answers: z.record(z.string(), z.unknown()).default({}),
});

portalRoutes.post("/:token/systems", async (c) => {
  const found = await resolvePortalToken(c.req.param("token"));
  if (!found) return c.json(INVALID, 404);
  const { link, client, org } = found;
  const body = submitSchema.parse(await c.req.json());

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(aiSystems)
    .where(and(eq(aiSystems.clientId, client.id), eq(aiSystems.source, "portal")));
  if (n >= MAX_PORTAL_SYSTEMS) return c.json({ error: "S-a atins numărul maxim de instrumente care pot fi adăugate din portal. Contactați cabinetul." }, 400);

  const portalAnswers = normalizePortalAnswers(body.answers as any);
  const answers = portalToAnswers(portalAnswers);
  const classification = classifyAiSystem(answers);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(aiSystems).values({
      organizationId: org.id,
      clientId: client.id,
      name: body.name,
      vendor: body.vendor,
      department: body.department,
      purpose: body.purpose,
      description: body.description,
      answers,
      riskLevel: classification.riskLevel,
      classification,
      source: "portal",
      rulesetVersion: RULESET_VERSION,
      portalAnswers,
      submittedByName: body.contactName,
      submittedByEmail: body.contactEmail,
    }).returning({ id: aiSystems.id });
    await syncSystemObligations(tx, { organizationId: org.id, clientId: client.id, aiSystemId: row.id, templates: classification.obligations });
    await syncClientObligations(tx, org.id, client.id);
    // anunță cabinetul (cu 2 minute întârziere: dacă clientul retrage imediat instrumentul, nu se trimite nimic)
    await enqueue("portal.notify", { organizationId: org.id, aiSystemId: row.id }, { tx, organizationId: org.id, runAt: new Date(Date.now() + 120_000) });
    return row.id;
  });
  await touch(link.id);
  await portalAudit(org.id, "portal_submit", id, { client: client.name, name: body.name, by: body.contactName });
  return c.json({ id }, 201);
});

portalRoutes.delete("/:token/systems/:id", async (c) => {
  const found = await resolvePortalToken(c.req.param("token"));
  if (!found) return c.json(INVALID, 404);
  const { client, org } = found;
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Instrumentul nu a fost găsit" }, 404);
  const sys = await db.query.aiSystems.findFirst({ where: and(eq(aiSystems.id, id), eq(aiSystems.clientId, client.id)) });
  if (!sys || sys.source !== "portal") return c.json({ error: "Instrumentul nu a fost găsit" }, 404);
  if (sys.reviewStatus === "aprobat") return c.json({ error: "Instrumentul a fost deja analizat de cabinet. Contactați cabinetul pentru modificări." }, 409);
  await db.transaction(async (tx) => {
    await tx.delete(aiSystems).where(and(eq(aiSystems.id, id), eq(aiSystems.clientId, client.id)));
    await syncClientObligations(tx, org.id, client.id);
  });
  await portalAudit(org.id, "portal_delete", id, { client: client.name, name: sys.name });
  return c.body(null, 204);
});
