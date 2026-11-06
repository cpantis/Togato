import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { RULESET_VERSION, classifyAiSystem, normalizeAnswers } from "@togato/shared";
import { db } from "../db";
import { aiSystems, clients, obligations, organizations } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { notFound, uuidParam } from "../lib/http";
import { syncClientObligations, syncSystemObligations } from "../services/obligationsSync";
import { memoAvailable } from "../services/memo";
import { enqueue } from "../jobs/queue";
import { createSnapshot, listSnapshots } from "../services/snapshots";
import { serializeObligation, serializeSystem } from "./serializers";

export const aiSystemRoutes = new Hono<AppEnv>();

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const codes = z.array(z.string().max(60)).max(30).default([]);

const answersSchema = z.object({
  qualification: z.enum(["da", "nu", "neclar"]).default("neclar"),
  aiCriteria: codes,
  scopeExclusions: codes,
  role: z.enum(["implementator", "furnizor", "implementator_modificat", "importator", "distribuitor"]).default("implementator"),
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
    client: { id: row.client.id, name: row.client.name, cui: row.client.cui, aiExcluded: row.client.aiExcluded },
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
  await db.transaction(async (tx) => {
    await tx.update(aiSystems).set({
      reviewStatus: body.status,
      reviewNote: body.note,
      reviewedBy: body.status === "propus" ? null : auth.userId,
      reviewedAt: body.status === "propus" ? null : new Date(),
      // decizia avocatului închide nota de reîncadrare după o modificare legislativă
      ...(body.status !== "propus" ? { reclassNote: null } : {}),
    }).where(and(eq(aiSystems.id, existing.id), eq(aiSystems.organizationId, auth.organizationId)));
    // aprobarea „îngheață” avizul: instantaneu imuabil, în aceeași tranzacție
    if (body.status === "aprobat") {
      await createSnapshot(tx, { organizationId: auth.organizationId, aiSystemId: existing.id, userId: auth.userId, userName: auth.name, reason: "aprobarea încadrării" });
    }
    await audit(auth, "review", "ai_system", existing.id, { status: body.status }, tx);
  });
  return c.json(await systemResponse(auth.organizationId, existing.id));
});

/**
 * POST /:id/memo — cere un memoriu juridic generat cu AI. Generarea rulează în worker (poate dura
 * un minut); răspunsul vine imediat cu `aiMemoStatus = "in_lucru"`, iar interfața verifică periodic.
 */
aiSystemRoutes.post("/:id/memo", async (c) => {
  const auth = c.get("auth");
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId), columns: { aiEnabled: true } });
  if (!org?.aiEnabled) return c.json({ error: "Analiza AI este dezactivată pentru cabinet. Un administrator o poate activa din Setări.", code: "ai_disabled" }, 403);
  if (!memoAvailable()) return c.json({ error: "Analiza AI nu e configurată (lipsește ANTHROPIC_API_KEY pe server)." }, 503);
  const s = await loadSystem(auth.organizationId, uuidParam(c.req.param("id")));
  if (s.client.aiExcluded) return c.json({ error: "Clientul este exclus de la analiza AI. Modificarea se face din pagina clientului.", code: "ai_excluded_client" }, 403);
  // o singură cerere în lucru per sistem (după 15 minute se consideră abandonată)
  const inFlight = s.aiMemoStatus === "in_lucru" && s.aiMemoRequestedAt && Date.now() - s.aiMemoRequestedAt.getTime() < 15 * 60_000;
  if (!inFlight) {
    await db.transaction(async (tx) => {
      await tx.update(aiSystems).set({ aiMemoStatus: "in_lucru", aiMemoError: null, aiMemoRequestedAt: new Date() })
        .where(and(eq(aiSystems.id, s.id), eq(aiSystems.organizationId, auth.organizationId)));
      await enqueue("memo.generate", { organizationId: auth.organizationId, aiSystemId: s.id, userId: auth.userId }, { tx, organizationId: auth.organizationId, maxAttempts: 3 });
    });
  }
  return c.json(await systemResponse(auth.organizationId, s.id), 202);
});

const RISK_LEVELS = ["neaplicabil", "minim", "transparenta", "risc_ridicat", "interzis"] as const;

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
  await db.transaction(async (tx) => {
  await tx.update(aiSystems).set(body.riskLevel
    ? {
      riskOverride: body.riskLevel, overrideReason: body.reason, overrideBy: auth.userId, overrideAt: new Date(), riskLevel: body.riskLevel,
      // încadrarea manuală este chiar decizia avocatului
      reviewStatus: "aprobat", reviewedBy: auth.userId, reviewedAt: new Date(), reclassNote: null,
    }
    : { riskOverride: null, overrideReason: null, overrideBy: null, overrideAt: null, riskLevel: computed, reviewStatus: "propus", reviewedBy: null, reviewedAt: null },
  ).where(and(eq(aiSystems.id, existing.id), eq(aiSystems.organizationId, auth.organizationId)));
  if (body.riskLevel) {
    await createSnapshot(tx, { organizationId: auth.organizationId, aiSystemId: existing.id, userId: auth.userId, userName: auth.name, reason: "încadrare stabilită manual" });
  }
  await audit(auth, body.riskLevel ? "override" : "override_clear", "ai_system", existing.id, { riskLevel: body.riskLevel, computed, reason: body.reason }, tx);
  });
  return c.json(await systemResponse(auth.organizationId, existing.id));
});

/** GET /:id/snapshots — istoricul avizelor înghețate ale sistemului */
aiSystemRoutes.get("/:id/snapshots", async (c) => {
  const auth = c.get("auth");
  const existing = await loadSystem(auth.organizationId, uuidParam(c.req.param("id")));
  const rows = await listSnapshots(db, auth.organizationId, existing.id);
  return c.json({ data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
});
