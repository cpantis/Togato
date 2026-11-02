import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { RULESET_VERSION, classifyAiSystem, normalizeAnswers } from "@togato/shared";
import { db } from "../db";
import { aiSystems, clients, obligations } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { notFound, uuidParam } from "../lib/http";
import { syncClientObligations, syncSystemObligations } from "../services/obligationsSync";
import { generateMemo, memoAvailable } from "../services/memo";
import { serializeObligation, serializeSystem } from "./serializers";

export const aiSystemRoutes = new Hono<AppEnv>();

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const codes = z.array(z.string().max(60)).max(30).default([]);

const answersSchema = z.object({
  role: z.enum(["implementator", "furnizor", "implementator_modificat"]).default("implementator"),
  prohibited: codes,
  annexIII: codes,
  annexI: z.boolean().default(false),
  derogations: codes,
  profiling: z.boolean().default(false),
  transparency: codes,
  editorialReview: z.boolean().default(false),
  publicService: z.boolean().default(false),
  publicAuthority: z.boolean().default(false),
  workplace: z.boolean().default(false),
  decisionsOnPersons: z.boolean().default(false),
  gpaiProvider: z.boolean().default(false),
});

const systemSchema = z.object({
  name: z.string().trim().min(2, "Numele sistemului e obligatoriu").max(200),
  vendor: optionalText(200),
  description: optionalText(5000),
  purpose: optionalText(2000),
  department: optionalText(200),
  answers: answersSchema,
});

async function loadSystem(organizationId: string, id: string) {
  const row = await db.query.aiSystems.findFirst({
    where: and(eq(aiSystems.id, id), eq(aiSystems.organizationId, organizationId)),
    with: { reviewer: { columns: { name: true } }, overrider: { columns: { name: true } }, client: true },
  });
  if (!row) notFound("Sistemul AI nu a fost găsit");
  return row;
}

async function systemResponse(organizationId: string, id: string) {
  const row = await loadSystem(organizationId, id);
  const obl = await db.select().from(obligations).where(eq(obligations.aiSystemId, id));
  obl.sort((a, b) => a.appliesFrom.localeCompare(b.appliesFrom) || a.article.localeCompare(b.article, "ro", { numeric: true }));
  return {
    ...serializeSystem(row),
    client: { id: row.client.id, name: row.client.name, cui: row.client.cui },
    obligations: obl.map(serializeObligation),
  };
}

/** POST /api/clients/:clientId/ai-systems — montat în index.ts */
export const createSystemHandler = new Hono<AppEnv>().post("/:clientId/ai-systems", async (c) => {
  const auth = c.get("auth");
  const clientId = uuidParam(c.req.param("clientId"));
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, clientId), eq(clients.organizationId, auth.organizationId)) });
  if (!client) notFound("Clientul nu a fost găsit");

  const body = systemSchema.parse(await c.req.json());
  const answers = normalizeAnswers(body.answers);
  const classification = classifyAiSystem(answers);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(aiSystems).values({
      organizationId: auth.organizationId,
      clientId,
      name: body.name,
      vendor: body.vendor,
      description: body.description,
      purpose: body.purpose,
      department: body.department,
      answers,
      riskLevel: classification.riskLevel,
      classification,
      rulesetVersion: RULESET_VERSION,
      createdBy: auth.userId,
    }).returning({ id: aiSystems.id });
    await syncSystemObligations(tx, { organizationId: auth.organizationId, clientId, aiSystemId: row.id, templates: classification.obligations });
    await syncClientObligations(tx, auth.organizationId, clientId);
    await audit(auth, "create", "ai_system", row.id, { name: body.name, riskLevel: classification.riskLevel }, tx);
    return row.id;
  });
  return c.json(await systemResponse(auth.organizationId, id), 201);
});

aiSystemRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");
  return c.json(await systemResponse(auth.organizationId, uuidParam(c.req.param("id"))));
});

aiSystemRoutes.put("/:id", async (c) => {
  const auth = c.get("auth");
  const existing = await loadSystem(auth.organizationId, uuidParam(c.req.param("id")));
  const body = systemSchema.parse(await c.req.json());
  const answers = normalizeAnswers(body.answers);
  const classification = classifyAiSystem(answers);
  // Orice schimbare a încadrării cere o nouă aprobare din partea avocatului
  const classificationChanged = JSON.stringify(normalizeAnswers(existing.answers)) !== JSON.stringify(answers);

  await db.transaction(async (tx) => {
    await tx.update(aiSystems).set({
      name: body.name,
      vendor: body.vendor,
      description: body.description,
      purpose: body.purpose,
      department: body.department,
      answers,
      riskLevel: existing.riskOverride ?? classification.riskLevel,
      classification,
      rulesetVersion: RULESET_VERSION,
      updatedAt: new Date(),
      ...(classificationChanged ? { reviewStatus: "propus" as const, reviewedAt: null, reviewedBy: null } : {}),
    }).where(and(eq(aiSystems.id, existing.id), eq(aiSystems.organizationId, auth.organizationId)));
    await syncSystemObligations(tx, { organizationId: auth.organizationId, clientId: existing.clientId, aiSystemId: existing.id, templates: classification.obligations });
    await audit(auth, "update", "ai_system", existing.id, { riskLevel: classification.riskLevel, reclassified: classificationChanged }, tx);
  });
  return c.json(await systemResponse(auth.organizationId, existing.id));
});

aiSystemRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const existing = await loadSystem(auth.organizationId, uuidParam(c.req.param("id")));
  await db.transaction(async (tx) => {
    await tx.delete(aiSystems).where(and(eq(aiSystems.id, existing.id), eq(aiSystems.organizationId, auth.organizationId)));
    await syncClientObligations(tx, auth.organizationId, existing.clientId);
    await audit(auth, "delete", "ai_system", existing.id, { name: existing.name }, tx);
  });
  return c.body(null, 204);
});

/** POST /:id/review { status: "aprobat" | "respins" | "propus", note } — decizia avocatului */
aiSystemRoutes.post("/:id/review", async (c) => {
  const auth = c.get("auth");
  const existing = await loadSystem(auth.organizationId, uuidParam(c.req.param("id")));
  const body = z.object({
    status: z.enum(["aprobat", "respins", "propus"]),
    note: z.string().trim().max(5000).nullish().transform((v) => (v ? v : null)),
  }).parse(await c.req.json());
  await db.update(aiSystems).set({
    reviewStatus: body.status,
    reviewNote: body.note,
    reviewedBy: body.status === "propus" ? null : auth.userId,
    reviewedAt: body.status === "propus" ? null : new Date(),
    // decizia avocatului închide nota de reîncadrare după o modificare legislativă
    ...(body.status !== "propus" ? { reclassNote: null } : {}),
  }).where(and(eq(aiSystems.id, existing.id), eq(aiSystems.organizationId, auth.organizationId)));
  await audit(auth, "review", "ai_system", existing.id, { status: body.status });
  return c.json(await systemResponse(auth.organizationId, existing.id));
});

/** POST /:id/memo — memoriu juridic generat cu AI */
aiSystemRoutes.post("/:id/memo", async (c) => {
  const auth = c.get("auth");
  if (!memoAvailable()) return c.json({ error: "Analiza AI nu e configurată (lipsește ANTHROPIC_API_KEY pe server)." }, 503);
  const s = await loadSystem(auth.organizationId, uuidParam(c.req.param("id")));
  const answers = normalizeAnswers(s.answers);
  try {
    const memo = await generateMemo({
      clientName: s.client.name,
      caen: s.client.caen,
      caenDescription: s.client.caenDescription,
      system: { name: s.name, vendor: s.vendor, description: s.description, purpose: s.purpose, department: s.department },
      answers,
      classification: s.classification ?? classifyAiSystem(answers),
    });
    await db.update(aiSystems).set({ aiMemo: memo.text, aiMemoCitations: memo.citations, aiMemoAt: new Date() })
      .where(and(eq(aiSystems.id, s.id), eq(aiSystems.organizationId, auth.organizationId)));
    await audit(auth, "memo", "ai_system", s.id, { citations: memo.citations.length });
  } catch (e) {
    console.error("[memo]", e);
    return c.json({ error: (e as Error).message.startsWith("Analiza") ? (e as Error).message : "Serviciul AI nu răspunde momentan. Reîncearcă peste câteva minute." }, 502);
  }
  return c.json(await systemResponse(auth.organizationId, s.id));
});

const RISK_LEVELS = ["minim", "transparenta", "risc_ridicat", "interzis"] as const;

/** POST /:id/override { riskLevel | null, reason } — încadrarea stabilită manual de avocat */
aiSystemRoutes.post("/:id/override", async (c) => {
  const auth = c.get("auth");
  const existing = await loadSystem(auth.organizationId, uuidParam(c.req.param("id")));
  const body = z.object({
    riskLevel: z.enum(RISK_LEVELS).nullable(),
    reason: z.string().trim().max(5000).nullish().transform((v) => (v ? v : null)),
  }).refine((b) => b.riskLevel === null || (b.reason && b.reason.length >= 5), { message: "Motivați încadrarea manuală (minimum 5 caractere)", path: ["reason"] })
    .parse(await c.req.json());

  const computed = existing.classification?.riskLevel ?? classifyAiSystem(normalizeAnswers(existing.answers)).riskLevel;
  await db.update(aiSystems).set(body.riskLevel
    ? {
      riskOverride: body.riskLevel, overrideReason: body.reason, overrideBy: auth.userId, overrideAt: new Date(), riskLevel: body.riskLevel,
      // încadrarea manuală este chiar decizia avocatului
      reviewStatus: "aprobat", reviewedBy: auth.userId, reviewedAt: new Date(), reclassNote: null,
    }
    : { riskOverride: null, overrideReason: null, overrideBy: null, overrideAt: null, riskLevel: computed, reviewStatus: "propus", reviewedBy: null, reviewedAt: null },
  ).where(and(eq(aiSystems.id, existing.id), eq(aiSystems.organizationId, auth.organizationId)));
  await audit(auth, body.riskLevel ? "override" : "override_clear", "ai_system", existing.id, { riskLevel: body.riskLevel, computed, reason: body.reason });
  return c.json(await systemResponse(auth.organizationId, existing.id));
});
