/**
 * GDPR pentru clienții cabinetului (montat la /api): registrul prelucrărilor, cererile persoanelor
 * vizate și incidentele de securitate. Aceleași reguli de separare: filtru pe cabinet + RLS.
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  ANSPDCP_DPIA_LIST, BREACH_TYPES, DATA_CATEGORIES, DSAR_LETTERS, DSAR_TYPES, assessDpia, suggestDpiaRisks, type DpiaRisk, LEGAL_BASES, SECURITY_MEASURES, SPECIAL_CONDITIONS, SUBJECT_CATEGORIES, TRANSFER_MECHANISMS,
  breachDeadline, breachDuties, checkProcessing, dsarDueDate,
} from "@togato/shared";
import { db } from "../db";
import { aiSystems, breaches, clients, dpias, dsarRequests, processingActivities } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { badRequest, notFound, uuidParam } from "../lib/http";
import { requireAdmin } from "../middleware/requireAdmin";
import { loadDocContext } from "../services/documents/common";
import { breachNotificationBlocks, dpiaBlocks, dsarLetterBlocks, renderGdprDocument, ropaBlocks } from "../services/documents/gdprTemplates";
import crypto from "crypto";
import { contentDisposition } from "../services/storage/files";
import { enqueue } from "../jobs/queue";

export const gdprRoutes = new Hono<AppEnv>();

const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const codes = (list: { code: string }[]) => z.array(z.enum(list.map((o) => o.code) as [string, ...string[]])).max(30).default([]);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data trebuie să fie în formatul AAAA-LL-ZZ");
const today = () => new Date().toISOString().slice(0, 10);

async function loadClient(organizationId: string, id: string) {
  const row = await db.query.clients.findFirst({ where: and(eq(clients.id, id), eq(clients.organizationId, organizationId)) });
  if (!row) notFound("Clientul nu a fost găsit");
  return row;
}

// ─── serializare ─────────────────────────────────────────
type Activity = typeof processingActivities.$inferSelect;
type Dsar = typeof dsarRequests.$inferSelect;
type Breach = typeof breaches.$inferSelect;

type DpiaRow = typeof dpias.$inferSelect;
export function dpiaSummary(d: DpiaRow | undefined) {
  if (!d) return null;
  return { id: d.id, finalizedAt: d.finalizedAt?.toISOString() ?? null, outcome: assessDpia({ necessity: d.necessity, risks: d.risks }).outcome, reviewOn: d.reviewOn };
}

export function serializeActivity(a: Activity, dpia?: DpiaRow) {
  return {
    id: a.id, clientId: a.clientId, name: a.name, purpose: a.purpose, role: a.role, controllerName: a.controllerName,
    legalBases: a.legalBases, legalBasisDetails: a.legalBasisDetails, specialConditions: a.specialConditions,
    dataCategories: a.dataCategories, subjectCategories: a.subjectCategories, recipients: a.recipients,
    transferOutsideEea: a.transferOutsideEea, transferCountries: a.transferCountries, transferMechanism: a.transferMechanism,
    retention: a.retention, securityMeasures: a.securityMeasures, securityDetails: a.securityDetails,
    largeScale: a.largeScale, systematicMonitoring: a.systematicMonitoring, automatedDecisions: a.automatedDecisions,
    dpiaListItems: a.dpiaListItems, aiSystemIds: a.aiSystemIds, notes: a.notes, updatedAt: a.updatedAt.toISOString(),
    check: checkProcessing({ ...a, usesAi: a.aiSystemIds.length > 0 }),
    dpia: dpiaSummary(dpia),
  };
}

export function serializeDsar(d: Dsar) {
  const open = d.status === "primita" || d.status === "in_lucru";
  return {
    id: d.id, clientId: d.clientId, type: d.type, requesterName: d.requesterName, requesterContact: d.requesterContact,
    receivedOn: d.receivedOn, dueOn: d.dueOn, extended: d.extended, extensionReason: d.extensionReason,
    identityVerified: d.identityVerified, status: d.status, details: d.details, outcome: d.outcome, closedOn: d.closedOn,
    overdue: open && d.dueOn < today(), createdAt: d.createdAt.toISOString(),
  };
}

export function serializeBreach(b: Breach) {
  const deadline = breachDeadline(b.discoveredAt);
  const duties = breachDuties(b.risk);
  return {
    id: b.id, clientId: b.clientId, title: b.title, description: b.description, breachTypes: b.breachTypes,
    discoveredAt: b.discoveredAt.toISOString(), occurredAt: b.occurredAt?.toISOString() ?? null,
    dataCategories: b.dataCategories, subjectsAffected: b.subjectsAffected, recordsAffected: b.recordsAffected,
    risk: b.risk, riskReasoning: b.riskReasoning, consequences: b.consequences, measures: b.measures,
    authorityNotifiedAt: b.authorityNotifiedAt?.toISOString() ?? null, authorityReference: b.authorityReference, delayReason: b.delayReason,
    subjectsNotifiedAt: b.subjectsNotifiedAt?.toISOString() ?? null, closedAt: b.closedAt?.toISOString() ?? null,
    deadline: deadline.toISOString(), duties,
    /** notificarea autorității e încă datorată și termenul a trecut */
    authorityOverdue: duties.notifyAuthority && !b.authorityNotifiedAt && deadline < new Date(),
    createdAt: b.createdAt.toISOString(),
  };
}

// ─── privire de ansamblu pe client ───────────────────────
gdprRoutes.get("/clients/:clientId/gdpr", async (c) => {
  const auth = c.get("auth");
  const client = await loadClient(auth.organizationId, uuidParam(c.req.param("clientId")));
  // secvențial: toate rulează în aceeași tranzacție a cererii
  const acts = await db.select().from(processingActivities)
    .where(and(eq(processingActivities.organizationId, auth.organizationId), eq(processingActivities.clientId, client.id))).orderBy(asc(processingActivities.name));
  const dsars = await db.select().from(dsarRequests)
    .where(and(eq(dsarRequests.organizationId, auth.organizationId), eq(dsarRequests.clientId, client.id))).orderBy(desc(dsarRequests.receivedOn));
  const brs = await db.select().from(breaches)
    .where(and(eq(breaches.organizationId, auth.organizationId), eq(breaches.clientId, client.id))).orderBy(desc(breaches.discoveredAt));
  const dps = await db.select().from(dpias).where(and(eq(dpias.organizationId, auth.organizationId), eq(dpias.clientId, client.id)));
  const byProcessing = new Map(dps.map((d) => [d.processingId, d]));
  return c.json({ processing: acts.map((a) => serializeActivity(a, byProcessing.get(a.id))), dsars: dsars.map(serializeDsar), breaches: brs.map(serializeBreach) });
});

/** GET /gdpr/overview — pentru panou: cereri deschise (după termen) și incidente deschise, la clienții activi */
gdprRoutes.get("/gdpr/overview", async (c) => {
  const auth = c.get("auth");
  const dsars = await db.select({ d: dsarRequests, clientName: clients.name }).from(dsarRequests)
    .innerJoin(clients, eq(clients.id, dsarRequests.clientId))
    .where(and(eq(dsarRequests.organizationId, auth.organizationId), inArray(dsarRequests.status, ["primita", "in_lucru"]), isNull(clients.archivedAt)))
    .orderBy(asc(dsarRequests.dueOn)).limit(20);
  const brs = await db.select({ b: breaches, clientName: clients.name }).from(breaches)
    .innerJoin(clients, eq(clients.id, breaches.clientId))
    .where(and(eq(breaches.organizationId, auth.organizationId), isNull(breaches.closedAt), isNull(clients.archivedAt)))
    .orderBy(asc(breaches.discoveredAt)).limit(20);
  return c.json({
    dsars: dsars.map((r) => ({ ...serializeDsar(r.d), clientName: r.clientName })),
    breaches: brs.map((r) => ({ ...serializeBreach(r.b), clientName: r.clientName })),
  });
});

// ─── registrul prelucrărilor ─────────────────────────────
const activitySchema = z.object({
  name: z.string().trim().min(2, "Denumirea activității e obligatorie").max(200),
  purpose: z.string().trim().min(3, "Descrieți scopul prelucrării").max(2000),
  role: z.enum(["operator", "operator_asociat", "persoana_imputernicita"]).default("operator"),
  controllerName: text(300),
  legalBases: codes(LEGAL_BASES),
  legalBasisDetails: text(1000),
  specialConditions: codes(SPECIAL_CONDITIONS),
  dataCategories: codes(DATA_CATEGORIES),
  subjectCategories: codes(SUBJECT_CATEGORIES),
  recipients: text(2000),
  transferOutsideEea: z.boolean().default(false),
  transferCountries: text(500),
  transferMechanism: z.enum(TRANSFER_MECHANISMS.map((o) => o.code) as [string, ...string[]]).nullish().transform((v) => v ?? null),
  retention: text(1000),
  securityMeasures: codes(SECURITY_MEASURES),
  securityDetails: text(2000),
  largeScale: z.boolean().default(false),
  systematicMonitoring: z.boolean().default(false),
  automatedDecisions: z.boolean().default(false),
  dpiaListItems: codes(ANSPDCP_DPIA_LIST),
  aiSystemIds: z.array(z.string().uuid()).max(50).default([]),
  notes: text(5000),
});

/** sistemele AI legate trebuie să fie ale aceluiași client */
async function checkAiSystems(organizationId: string, clientId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await db.select({ id: aiSystems.id }).from(aiSystems)
    .where(and(eq(aiSystems.organizationId, organizationId), eq(aiSystems.clientId, clientId), inArray(aiSystems.id, ids)));
  if (rows.length !== new Set(ids).size) badRequest("Unele sisteme AI nu aparțin acestui client.");
}

gdprRoutes.post("/clients/:clientId/processing", async (c) => {
  const auth = c.get("auth");
  const client = await loadClient(auth.organizationId, uuidParam(c.req.param("clientId")));
  const body = activitySchema.parse(await c.req.json());
  await checkAiSystems(auth.organizationId, client.id, body.aiSystemIds);
  const [row] = await db.insert(processingActivities).values({ ...body, organizationId: auth.organizationId, clientId: client.id, updatedBy: auth.userId }).returning();
  await audit(auth, "create", "processing", row.id, { name: row.name });
  return c.json(serializeActivity(row), 201);
});

async function loadActivity(organizationId: string, id: string) {
  const row = await db.query.processingActivities.findFirst({ where: and(eq(processingActivities.id, id), eq(processingActivities.organizationId, organizationId)) });
  if (!row) notFound("Activitatea nu a fost găsită");
  return row;
}

gdprRoutes.put("/processing/:id", async (c) => {
  const auth = c.get("auth");
  const existing = await loadActivity(auth.organizationId, uuidParam(c.req.param("id")));
  const body = activitySchema.parse(await c.req.json());
  await checkAiSystems(auth.organizationId, existing.clientId, body.aiSystemIds);
  const [row] = await db.update(processingActivities).set({ ...body, updatedBy: auth.userId, updatedAt: new Date() })
    .where(and(eq(processingActivities.id, existing.id), eq(processingActivities.organizationId, auth.organizationId))).returning();
  await audit(auth, "update", "processing", row.id, { name: row.name });
  const dpia = await db.query.dpias.findFirst({ where: and(eq(dpias.processingId, row.id), eq(dpias.organizationId, auth.organizationId)) });
  return c.json(serializeActivity(row, dpia));
});

gdprRoutes.delete("/processing/:id", async (c) => {
  const auth = c.get("auth");
  const existing = await loadActivity(auth.organizationId, uuidParam(c.req.param("id")));
  await db.delete(processingActivities).where(and(eq(processingActivities.id, existing.id), eq(processingActivities.organizationId, auth.organizationId)));
  await audit(auth, "delete", "processing", existing.id, { name: existing.name });
  return c.body(null, 204);
});

/** GET /clients/:clientId/gdpr/ropa — registrul (Word), gata de completat și semnat */
gdprRoutes.get("/clients/:clientId/gdpr/ropa", async (c) => {
  const auth = c.get("auth");
  const client = await loadClient(auth.organizationId, uuidParam(c.req.param("clientId")));
  const ctx = (await loadDocContext(auth.organizationId, client.id, auth.name))!;
  const acts = await db.select().from(processingActivities)
    .where(and(eq(processingActivities.organizationId, auth.organizationId), eq(processingActivities.clientId, client.id))).orderBy(asc(processingActivities.name));
  const aiNames = new Map(ctx.systems.map((s) => [s.id, s.name]));
  const doc = await renderGdprDocument(ctx, "Registrul activităților de prelucrare", ropaBlocks(ctx, acts, aiNames));
  await audit(auth, "generate", "document", client.id, { type: "registru_prelucrari" });
  return new Response(new Uint8Array(doc.buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": contentDisposition(doc.filename), "Cache-Control": "no-store" } });
});

// ─── cererile persoanelor vizate ─────────────────────────
const dsarSchema = z.object({
  type: z.enum(DSAR_TYPES.map((t) => t.code) as [string, ...string[]]),
  requesterName: z.string().trim().min(2, "Numele solicitantului e obligatoriu").max(200),
  requesterContact: text(300),
  receivedOn: day,
  details: text(5000),
});

gdprRoutes.post("/clients/:clientId/dsar", async (c) => {
  const auth = c.get("auth");
  const client = await loadClient(auth.organizationId, uuidParam(c.req.param("clientId")));
  const body = dsarSchema.parse(await c.req.json());
  if (body.receivedOn > today()) badRequest("Data primirii nu poate fi în viitor.");
  const [row] = await db.insert(dsarRequests).values({
    ...body, type: body.type as Dsar["type"], organizationId: auth.organizationId, clientId: client.id,
    dueOn: dsarDueDate(body.receivedOn, false), createdBy: auth.userId,
  }).returning();
  await audit(auth, "create", "dsar", row.id, { type: row.type });
  return c.json(serializeDsar(row), 201);
});

async function loadDsar(organizationId: string, id: string) {
  const row = await db.query.dsarRequests.findFirst({ where: and(eq(dsarRequests.id, id), eq(dsarRequests.organizationId, organizationId)) });
  if (!row) notFound("Cererea nu a fost găsită");
  return row;
}

const dsarPatch = z.object({
  status: z.enum(["primita", "in_lucru", "finalizata", "respinsa"]).optional(),
  identityVerified: z.boolean().optional(),
  outcome: text(5000),
  details: text(5000),
  /** prelungirea cu două luni, motivată (complexitate / număr mare de cereri), comunicată în prima lună */
  extend: z.object({ reason: z.string().trim().min(10, "Motivați prelungirea (Art. 12(3))").max(2000) }).optional(),
});

gdprRoutes.patch("/dsar/:id", async (c) => {
  const auth = c.get("auth");
  const d = await loadDsar(auth.organizationId, uuidParam(c.req.param("id")));
  const body = dsarPatch.parse(await c.req.json());
  const patch: Partial<typeof dsarRequests.$inferInsert> = { updatedAt: new Date() };
  if (body.extend) {
    if (d.extended) badRequest("Termenul a fost deja prelungit.");
    if (today() > d.dueOn) badRequest("Prelungirea trebuie comunicată în termenul inițial de o lună.");
    Object.assign(patch, { extended: true, extensionReason: body.extend.reason, dueOn: dsarDueDate(d.receivedOn, true) });
  }
  if (body.identityVerified !== undefined) patch.identityVerified = body.identityVerified;
  if (body.details !== undefined) patch.details = body.details;
  if (body.outcome !== undefined) patch.outcome = body.outcome;
  if (body.status) {
    if ((body.status === "finalizata" || body.status === "respinsa") && !(body.outcome ?? d.outcome)) badRequest("Descrieți răspunsul dat solicitantului înainte de închiderea cererii.");
    patch.status = body.status;
    patch.closedOn = body.status === "finalizata" || body.status === "respinsa" ? today() : null;
  }
  const [row] = await db.update(dsarRequests).set(patch).where(and(eq(dsarRequests.id, d.id), eq(dsarRequests.organizationId, auth.organizationId))).returning();
  await audit(auth, "update", "dsar", d.id, { status: body.status, extended: !!body.extend });
  return c.json(serializeDsar(row));
});

gdprRoutes.delete("/dsar/:id", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const d = await loadDsar(auth.organizationId, uuidParam(c.req.param("id")));
  await db.delete(dsarRequests).where(and(eq(dsarRequests.id, d.id), eq(dsarRequests.organizationId, auth.organizationId)));
  await audit(auth, "delete", "dsar", d.id);
  return c.body(null, 204);
});

// ─── incidentele de securitate ───────────────────────────
const iso = z.string().datetime({ offset: true, message: "Dată și oră invalide" });
const breachSchema = z.object({
  title: z.string().trim().min(3, "Dați un titlu incidentului").max(200),
  description: text(5000),
  breachTypes: codes(BREACH_TYPES),
  discoveredAt: iso,
  occurredAt: iso.nullish().transform((v) => v ?? null),
  dataCategories: codes(DATA_CATEGORIES),
  subjectsAffected: z.number().int().min(0).max(1e9).nullish().transform((v) => v ?? null),
  recordsAffected: z.number().int().min(0).max(1e10).nullish().transform((v) => v ?? null),
  risk: z.enum(["neevaluat", "fara_risc", "risc", "risc_ridicat"]).default("neevaluat"),
  riskReasoning: text(3000),
  consequences: text(3000),
  measures: text(5000),
  authorityNotifiedAt: iso.nullish().transform((v) => v ?? null),
  authorityReference: text(200),
  delayReason: text(3000),
  subjectsNotifiedAt: iso.nullish().transform((v) => v ?? null),
  closed: z.boolean().optional(),
});

function breachValues(body: z.infer<typeof breachSchema>) {
  const discovered = new Date(body.discoveredAt);
  if (discovered.getTime() > Date.now() + 60_000) badRequest("Momentul luării la cunoștință nu poate fi în viitor.");
  if (body.occurredAt && new Date(body.occurredAt) > discovered) badRequest("Incidentul nu se poate produce după ce a fost descoperit.");
  const notified = body.authorityNotifiedAt ? new Date(body.authorityNotifiedAt) : null;
  if (notified && notified > breachDeadline(discovered) && !body.delayReason) badRequest("Notificarea a depășit 72 de ore: indicați motivele întârzierii (Art. 33(1)).");
  if (body.closed && body.risk === "neevaluat") badRequest("Evaluați riscul înainte de a închide incidentul.");
  if (body.closed && breachDuties(body.risk).notifyAuthority && !notified) badRequest("Incidentul trebuie notificat ANSPDCP înainte de închidere (sau reevaluați riscul, cu motivare).");
  if (body.closed && body.risk === "fara_risc" && !body.riskReasoning) badRequest("Motivați de ce incidentul nu prezintă risc (Art. 33(5)).");
  const { closed, ...rest } = body;
  return {
    ...rest,
    discoveredAt: discovered,
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : null,
    authorityNotifiedAt: notified,
    subjectsNotifiedAt: body.subjectsNotifiedAt ? new Date(body.subjectsNotifiedAt) : null,
    closedAt: closed ? new Date() : null,
  };
}

gdprRoutes.post("/clients/:clientId/breaches", async (c) => {
  const auth = c.get("auth");
  const client = await loadClient(auth.organizationId, uuidParam(c.req.param("clientId")));
  const body = breachSchema.parse(await c.req.json());
  const [row] = await db.insert(breaches).values({ ...breachValues(body), organizationId: auth.organizationId, clientId: client.id, createdBy: auth.userId }).returning();
  // alertă imediată + reamintire cu 24 de ore înainte de termen (dacă notificarea e încă datorată)
  const deadline = breachDeadline(row.discoveredAt);
  if (breachDuties(row.risk).notifyAuthority && !row.authorityNotifiedAt) {
    await enqueue("breach.alert", { organizationId: auth.organizationId, breachId: row.id, kind: "nou" }, { organizationId: auth.organizationId });
    const remindAt = new Date(deadline.getTime() - 24 * 3600_000);
    if (remindAt > new Date()) await enqueue("breach.alert", { organizationId: auth.organizationId, breachId: row.id, kind: "reamintire" }, { organizationId: auth.organizationId, runAt: remindAt, dedupeKey: `breach-remind:${row.id}` });
  }
  await audit(auth, "create", "breach", row.id, { title: row.title, risk: row.risk });
  return c.json(serializeBreach(row), 201);
});

async function loadBreach(organizationId: string, id: string) {
  const row = await db.query.breaches.findFirst({ where: and(eq(breaches.id, id), eq(breaches.organizationId, organizationId)) });
  if (!row) notFound("Incidentul nu a fost găsit");
  return row;
}

gdprRoutes.put("/breaches/:id", async (c) => {
  const auth = c.get("auth");
  const b = await loadBreach(auth.organizationId, uuidParam(c.req.param("id")));
  const body = breachSchema.parse(await c.req.json());
  const values = breachValues(body);
  // închiderea păstrează data inițială; redeschiderea o șterge
  if (b.closedAt && body.closed) values.closedAt = b.closedAt;
  const [row] = await db.update(breaches).set({ ...values, updatedAt: new Date() }).where(and(eq(breaches.id, b.id), eq(breaches.organizationId, auth.organizationId))).returning();
  await audit(auth, "update", "breach", b.id, { risk: row.risk, closed: !!row.closedAt, notified: !!row.authorityNotifiedAt });
  return c.json(serializeBreach(row));
});

/** ștergerea din registrul incidentelor — doar administratorii (registrul servește ca dovadă, Art. 33(5)) */
gdprRoutes.delete("/breaches/:id", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const b = await loadBreach(auth.organizationId, uuidParam(c.req.param("id")));
  await db.delete(breaches).where(and(eq(breaches.id, b.id), eq(breaches.organizationId, auth.organizationId)));
  await audit(auth, "delete", "breach", b.id, { title: b.title });
  return c.body(null, 204);
});

/** GET /breaches/:id/notification — proiectul notificării către ANSPDCP (Word) */
gdprRoutes.get("/breaches/:id/notification", async (c) => {
  const auth = c.get("auth");
  const b = await loadBreach(auth.organizationId, uuidParam(c.req.param("id")));
  const ctx = (await loadDocContext(auth.organizationId, b.clientId, auth.name))!;
  const doc = await renderGdprDocument(ctx, "Notificare incident ANSPDCP", breachNotificationBlocks(ctx, b));
  await audit(auth, "generate", "document", b.clientId, { type: "notificare_incident", breachId: b.id });
  return new Response(new Uint8Array(doc.buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": contentDisposition(doc.filename), "Cache-Control": "no-store" } });
});


// ─── evaluarea de impact (Art. 35) ───────────────────────

function serializeDpia(d: { id: string | null; description: string | null; necessity: string | null; risks: DpiaRisk[]; dpoOpinion: string | null; subjectsViews: string | null; reviewOn: string | null; finalizedAt: Date | null; updatedAt: Date | null }) {
  return {
    id: d.id, description: d.description, necessity: d.necessity, risks: d.risks, dpoOpinion: d.dpoOpinion, subjectsViews: d.subjectsViews,
    reviewOn: d.reviewOn, finalizedAt: d.finalizedAt?.toISOString() ?? null, updatedAt: d.updatedAt?.toISOString() ?? null,
    assessment: assessDpia({ necessity: d.necessity, risks: d.risks }),
  };
}

/** descrierea precompletată din registru (Art. 35(7)(a)) */
function describeActivity(a: Activity): string {
  const L = (list: { code: string; label: string }[], codes: string[]) => codes.map((c) => list.find((o) => o.code === c)?.label ?? c).join("; ");
  return [
    `Scop: ${a.purpose}`,
    `Temei legal: ${L(LEGAL_BASES, a.legalBases) || "—"}`,
    `Persoane vizate: ${L(SUBJECT_CATEGORIES, a.subjectCategories) || "—"}`,
    `Categorii de date: ${L(DATA_CATEGORIES, a.dataCategories) || "—"}`,
    `Destinatari: ${a.recipients || "—"}`,
    `Păstrare: ${a.retention || "—"}`,
    a.transferOutsideEea ? `Transfer în afara SEE: ${a.transferCountries || "—"}` : null,
  ].filter(Boolean).join("\n");
}

/** GET /processing/:id/dpia — evaluarea salvată sau un proiect precompletat (nesalvat) */
gdprRoutes.get("/processing/:id/dpia", async (c) => {
  const auth = c.get("auth");
  const a = await loadActivity(auth.organizationId, uuidParam(c.req.param("id")));
  const d = await db.query.dpias.findFirst({ where: and(eq(dpias.processingId, a.id), eq(dpias.organizationId, auth.organizationId)) });
  const activity = serializeActivity(a, d);
  if (d) return c.json({ activity, dpia: serializeDpia(d), saved: true });
  const risks = suggestDpiaRisks({ ...a, usesAi: a.aiSystemIds.length > 0 }).map((r) => ({ ...r, id: crypto.randomUUID() }));
  return c.json({ activity, dpia: serializeDpia({ id: null, description: describeActivity(a), necessity: null, risks, dpoOpinion: null, subjectsViews: null, reviewOn: null, finalizedAt: null, updatedAt: null }), saved: false });
});

const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const dpiaSchema = z.object({
  description: text(10000),
  necessity: text(10000),
  risks: z.array(z.object({
    id: z.string().uuid(), title: z.string().trim().min(2).max(300), description: z.string().trim().max(3000).default(""),
    likelihood: level, severity: level, measures: z.string().trim().max(5000).default(""), residualLikelihood: level, residualSeverity: level,
  })).max(40),
  dpoOpinion: text(5000),
  subjectsViews: text(5000),
  reviewOn: day.nullish().transform((v) => v ?? null),
  /** true = finalizează (doar dacă nu lipsește nimic); orice modificare ulterioară o readuce la proiect */
  finalize: z.boolean().default(false),
});

gdprRoutes.put("/processing/:id/dpia", async (c) => {
  const auth = c.get("auth");
  const a = await loadActivity(auth.organizationId, uuidParam(c.req.param("id")));
  const { finalize, ...body } = dpiaSchema.parse(await c.req.json());
  const assessment = assessDpia({ necessity: body.necessity, risks: body.risks });
  if (finalize && assessment.missing.length) return c.json({ error: `Evaluarea nu poate fi finalizată: ${assessment.missing.join(" ")}`, missing: assessment.missing }, 400);
  const values = { ...body, finalizedAt: finalize ? new Date() : null, finalizedBy: finalize ? auth.userId : null, updatedBy: auth.userId, updatedAt: new Date() };
  const [row] = await db.insert(dpias).values({ ...values, organizationId: auth.organizationId, clientId: a.clientId, processingId: a.id })
    .onConflictDoUpdate({ target: dpias.processingId, set: values, setWhere: eq(dpias.organizationId, auth.organizationId) }).returning();
  if (!row) notFound("Evaluarea nu a fost găsită");
  await audit(auth, finalize ? "finalize" : "update", "dpia", row.id, { processing: a.name, outcome: assessment.outcome });
  return c.json({ activity: serializeActivity(a, row), dpia: serializeDpia(row), saved: true });
});

gdprRoutes.get("/processing/:id/dpia/docx", async (c) => {
  const auth = c.get("auth");
  const a = await loadActivity(auth.organizationId, uuidParam(c.req.param("id")));
  const d = await db.query.dpias.findFirst({ where: and(eq(dpias.processingId, a.id), eq(dpias.organizationId, auth.organizationId)) });
  if (!d) notFound("Salvați întâi evaluarea de impact");
  const ctx = (await loadDocContext(auth.organizationId, a.clientId, auth.name))!;
  const doc = await renderGdprDocument(ctx, `Evaluarea de impact - ${a.name}`, dpiaBlocks(ctx, a, d));
  await audit(auth, "generate", "document", a.clientId, { type: "dpia", processingId: a.id });
  return new Response(new Uint8Array(doc.buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": contentDisposition(doc.filename), "Cache-Control": "no-store" } });
});

// ─── scrisori pentru cererile persoanelor vizate ─────────

/** GET /dsar/:id/letter?kind=confirmare|identitate|prelungire|raspuns|refuz — proiectul scrisorii (Word) */
gdprRoutes.get("/dsar/:id/letter", async (c) => {
  const auth = c.get("auth");
  const d = await loadDsar(auth.organizationId, uuidParam(c.req.param("id")));
  const kind = z.enum(DSAR_LETTERS.map((l) => l.code) as [string, ...string[]]).parse(c.req.query("kind"));
  if (kind === "prelungire" && !d.extended) badRequest("Prelungiți întâi termenul (cu motivarea), apoi generați notificarea.");
  const ctx = (await loadDocContext(auth.organizationId, d.clientId, auth.name))!;
  const acts = await db.select().from(processingActivities)
    .where(and(eq(processingActivities.organizationId, auth.organizationId), eq(processingActivities.clientId, d.clientId))).orderBy(asc(processingActivities.name));
  const label = DSAR_LETTERS.find((l) => l.code === kind)!.label;
  const doc = await renderGdprDocument(ctx, `${label} - ${d.requesterName}`, dsarLetterBlocks(ctx, d, kind as never, acts));
  await audit(auth, "generate", "document", d.clientId, { type: `dsar_${kind}`, dsarId: d.id });
  return new Response(new Uint8Array(doc.buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": contentDisposition(doc.filename), "Cache-Control": "no-store" } });
});
