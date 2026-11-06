import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { ClientSummary } from "@togato/shared";
import { db } from "../db";
import { aiSystems, clients, evidence, obligations, portalLinks, users } from "../db/schema";
import { enqueue } from "../jobs/queue";
import { assertCanAdd } from "../services/billing";
import { buildDossierZip } from "../services/dossierExport";
import { contentDisposition } from "../services/storage/files";
import { requireAdmin } from "../middleware/requireAdmin";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { badRequest, notFound, uuidParam } from "../lib/http";
import { cleanCui, isValidCui, lookupCompany } from "../services/companyLookup";
import { serializeObligation, serializeSystem } from "./serializers";

export const clientRoutes = new Hono<AppEnv>();

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

const clientSchema = z.object({
  cui: z.string().trim().max(20).nullish().transform((v) => (v ? cleanCui(v) : null)),
  name: z.string().trim().min(2, "Denumirea e obligatorie").max(300),
  regCom: optionalText(50),
  address: optionalText(500),
  city: optionalText(100),
  county: optionalText(100),
  caen: optionalText(10),
  caenDescription: optionalText(300),
  employees: z.number().int().min(0).max(10_000_000).nullish().transform((v) => v ?? null),
  turnover: z.number().min(0).max(1e15).nullish().transform((v) => (v === null || v === undefined ? null : Math.round(v))),
  vatPayer: z.boolean().nullish().transform((v) => v ?? null),
  contactName: optionalText(200),
  contactEmail: z.string().trim().email("Email de contact invalid").max(200).nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  notes: optionalText(5000),
  responsibleUserId: z.string().uuid("Avocat responsabil invalid").nullish(),
  sourceData: z.unknown().optional(),
});

/** Avocatul responsabil trebuie să fie un membru activ al aceluiași cabinet. */
async function checkResponsible(organizationId: string, userId: string | null | undefined) {
  if (!userId) return;
  const u = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.organizationId, organizationId), eq(users.status, "activ")) });
  if (!u) badRequest("Avocatul responsabil nu e un membru activ al cabinetului.");
}

/** POST /lookup { cui } — datele firmei de la ANAF (și ListaFirme, dacă e configurat) */
clientRoutes.post("/lookup", async (c) => {
  const { cui } = z.object({ cui: z.string().trim().min(2).max(20) }).parse(await c.req.json());
  if (!isValidCui(cui)) badRequest("CUI invalid — verifică cifrele (cifra de control nu se potrivește).");
  try {
    const data = await lookupCompany(cui);
    if (!data) return c.json({ error: "Nu am găsit nicio firmă cu acest CUI." }, 404);
    return c.json(data);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

clientRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const search = c.req.query("search")?.trim();
  const mine = c.req.query("mine") === "1";
  // implicit doar clienții activi; ?archived=1 = doar cei arhivați
  const archived = c.req.query("archived") === "1";
  const where = and(
    eq(clients.organizationId, auth.organizationId),
    archived ? isNotNull(clients.archivedAt) : isNull(clients.archivedAt),
    mine ? eq(clients.responsibleUserId, auth.userId) : undefined,
    search ? or(ilike(clients.name, `%${search}%`), ilike(clients.cui, `%${search.replace(/\D/g, "") || search}%`)) : undefined,
  );
  // paginare: ?limit (implicit 50, maximum 200) și ?offset
  const { limit, offset } = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  }).parse({ limit: c.req.query("limit"), offset: c.req.query("offset") });
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(clients).where(where);
  const rows = await db.select({ client: clients, responsibleName: users.name }).from(clients)
    .leftJoin(users, eq(users.id, clients.responsibleUserId))
    .where(where).orderBy(asc(clients.name), asc(clients.id)).limit(limit).offset(offset)
    .then((list) => list.map((r) => ({ ...r.client, responsibleName: r.responsibleName })));
  const ids = rows.map((r) => r.id);

  const risk = ids.length
    ? await db.select({ clientId: aiSystems.clientId, riskLevel: aiSystems.riskLevel, n: sql<number>`count(*)::int`, pending: sql<number>`count(*) filter (where ${aiSystems.reviewStatus} <> 'aprobat')::int` })
      .from(aiSystems).where(inArray(aiSystems.clientId, ids)).groupBy(aiSystems.clientId, aiSystems.riskLevel)
    : [];
  const obl = ids.length
    ? await db.select({ clientId: obligations.clientId, total: sql<number>`count(*) filter (where ${obligations.status} <> 'nu_se_aplica')::int`, done: sql<number>`count(*) filter (where ${obligations.status} = 'indeplinit')::int` })
      .from(obligations).where(inArray(obligations.clientId, ids)).groupBy(obligations.clientId)
    : [];

  const data: ClientSummary[] = rows.map((r) => {
    const rr = risk.filter((x) => x.clientId === r.id);
    const o = obl.find((x) => x.clientId === r.id);
    return {
      id: r.id, cui: r.cui, name: r.name, city: r.city, county: r.county, caen: r.caen, caenDescription: r.caenDescription,
      employees: r.employees, createdAt: r.createdAt.toISOString(), archivedAt: r.archivedAt?.toISOString() ?? null,
      responsibleUserId: r.responsibleUserId, responsibleName: r.responsibleName,
      systemsCount: rr.reduce((s, x) => s + x.n, 0),
      riskCounts: Object.fromEntries(rr.map((x) => [x.riskLevel, x.n])),
      pendingReview: rr.reduce((s, x) => s + x.pending, 0),
      obligationsTotal: o?.total ?? 0,
      obligationsDone: o?.done ?? 0,
    };
  });
  return c.json({ data, total, limit, offset });
});

clientRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = clientSchema.parse(await c.req.json());
  if (body.cui && !isValidCui(body.cui)) badRequest("CUI invalid — verifică cifrele.");
  await assertCanAdd(auth.organizationId, "client");
  await checkResponsible(auth.organizationId, body.responsibleUserId);
  if (body.cui) {
    const dup = await db.query.clients.findFirst({ where: and(eq(clients.organizationId, auth.organizationId), eq(clients.cui, body.cui)) });
    if (dup) return c.json({ error: `Clientul cu CUI ${body.cui} există deja: ${dup.name}`, clientId: dup.id }, 409);
  }
  const [row] = await db.insert(clients).values({
    ...body,
    sourceData: body.sourceData ?? null,
    // implicit, cine adaugă clientul devine responsabil
    responsibleUserId: body.responsibleUserId === undefined ? auth.userId : body.responsibleUserId,
    organizationId: auth.organizationId,
    createdBy: auth.userId,
  }).returning();
  await audit(auth, "create", "client", row.id, { name: row.name, cui: row.cui });
  return c.json({ id: row.id }, 201);
});

async function loadClient(organizationId: string, id: string) {
  const row = await db.query.clients.findFirst({ where: and(eq(clients.id, id), eq(clients.organizationId, organizationId)) });
  if (!row) notFound("Clientul nu a fost găsit");
  return row;
}

clientRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");
  const row = await loadClient(auth.organizationId, uuidParam(c.req.param("id")));

  const systems = await db.query.aiSystems.findMany({
    where: eq(aiSystems.clientId, row.id),
    with: { reviewer: { columns: { name: true } }, overrider: { columns: { name: true } } },
    orderBy: [desc(aiSystems.createdAt)],
  });
  const counts = await db.select({
    aiSystemId: obligations.aiSystemId,
    total: sql<number>`count(*) filter (where ${obligations.status} <> 'nu_se_aplica')::int`,
    done: sql<number>`count(*) filter (where ${obligations.status} = 'indeplinit')::int`,
  }).from(obligations).where(eq(obligations.clientId, row.id)).groupBy(obligations.aiSystemId);
  const clientObl = await db.select().from(obligations)
    .where(and(eq(obligations.clientId, row.id), isNull(obligations.aiSystemId)))
    .orderBy(asc(obligations.appliesFrom), asc(obligations.code));

  return c.json({
    id: row.id, cui: row.cui, name: row.name, regCom: row.regCom, address: row.address, city: row.city, county: row.county,
    caen: row.caen, caenDescription: row.caenDescription, employees: row.employees, turnover: row.turnover, vatPayer: row.vatPayer,
    contactName: row.contactName, contactEmail: row.contactEmail, notes: row.notes, createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    aiExcluded: row.aiExcluded,
    responsibleUserId: row.responsibleUserId,
    responsibleName: row.responsibleUserId ? (await db.query.users.findFirst({ where: eq(users.id, row.responsibleUserId), columns: { name: true } }))?.name ?? null : null,
    aiSystems: systems.map((s) => {
      const cnt = counts.find((x) => x.aiSystemId === s.id);
      return { ...serializeSystem(s), obligationsTotal: cnt?.total ?? 0, obligationsDone: cnt?.done ?? 0 };
    }),
    clientObligations: clientObl.map(serializeObligation),
  });
});

clientRoutes.put("/:id", async (c) => {
  const auth = c.get("auth");
  const row = await loadClient(auth.organizationId, uuidParam(c.req.param("id")));
  const body = clientSchema.parse(await c.req.json());
  await checkResponsible(auth.organizationId, body.responsibleUserId);
  if (body.cui && body.cui !== row.cui) {
    if (!isValidCui(body.cui)) badRequest("CUI invalid — verifică cifrele.");
    const dup = await db.query.clients.findFirst({ where: and(eq(clients.organizationId, auth.organizationId), eq(clients.cui, body.cui)) });
    if (dup) return c.json({ error: `CUI-ul ${body.cui} aparține deja clientului ${dup.name}` }, 409);
  }
  const { sourceData, responsibleUserId, ...fields } = body;
  await db.update(clients).set({
    ...fields,
    ...(sourceData !== undefined ? { sourceData } : {}),
    ...(responsibleUserId !== undefined ? { responsibleUserId } : {}),
    updatedAt: new Date(),
  })
    .where(and(eq(clients.id, row.id), eq(clients.organizationId, auth.organizationId)));
  await audit(auth, "update", "client", row.id, { name: body.name });
  return c.json({ ok: true });
});

/**
 * POST /:id/archive — clientul iese din liste, termene și rezumate; portalul se dezactivează.
 * Datele (inclusiv avizele înghețate și dovezile) rămân, pentru obligația de arhivare.
 */
clientRoutes.post("/:id/archive", async (c) => {
  const auth = c.get("auth");
  const row = await loadClient(auth.organizationId, uuidParam(c.req.param("id")));
  if (row.archivedAt) return c.json({ ok: true, archivedAt: row.archivedAt.toISOString() });
  const now = new Date();
  await db.update(clients).set({ archivedAt: now, archivedBy: auth.userId, updatedAt: now })
    .where(and(eq(clients.id, row.id), eq(clients.organizationId, auth.organizationId)));
  await db.delete(portalLinks).where(and(eq(portalLinks.clientId, row.id), eq(portalLinks.organizationId, auth.organizationId)));
  await audit(auth, "archive", "client", row.id, { name: row.name });
  return c.json({ ok: true, archivedAt: now.toISOString() });
});

clientRoutes.post("/:id/unarchive", async (c) => {
  const auth = c.get("auth");
  const row = await loadClient(auth.organizationId, uuidParam(c.req.param("id")));
  if (row.archivedAt) await assertCanAdd(auth.organizationId, "client");
  await db.update(clients).set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
    .where(and(eq(clients.id, row.id), eq(clients.organizationId, auth.organizationId)));
  await audit(auth, "unarchive", "client", row.id, { name: row.name });
  return c.json({ ok: true });
});

/**
 * DELETE /:id — ștergere definitivă (inclusiv avize și dovezi). Doar pentru clienți arhivați,
 * doar de un administrator, cu numele clientului confirmat (?confirm=<denumire>).
 */
clientRoutes.delete("/:id", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const row = await loadClient(auth.organizationId, uuidParam(c.req.param("id")));
  if (!row.archivedAt) return c.json({ error: "Arhivați mai întâi clientul. Ștergerea definitivă e permisă doar pentru clienții arhivați.", code: "not_archived" }, 409);
  if ((c.req.query("confirm") ?? "").trim() !== row.name) badRequest("Confirmați ștergerea scriind exact denumirea clientului.");
  const files = await db.select({ key: evidence.storageKey }).from(evidence)
    .where(and(eq(evidence.clientId, row.id), eq(evidence.organizationId, auth.organizationId)));
  await db.delete(clients).where(and(eq(clients.id, row.id), eq(clients.organizationId, auth.organizationId)));
  if (files.length) await enqueue("storage.delete", { keys: files.map((f) => f.key) }, { organizationId: auth.organizationId });
  await audit(auth, "delete", "client", row.id, { name: row.name, cui: row.cui, files: files.length });
  return c.body(null, 204);
});

/** GET /:id/export — dosarul complet al clientului (ZIP) */
clientRoutes.get("/:id/export", async (c) => {
  const auth = c.get("auth");
  const row = await loadClient(auth.organizationId, uuidParam(c.req.param("id")));
  const result = await buildDossierZip(auth.organizationId, row.id, auth.name);
  if (!result) notFound("Clientul nu a fost găsit");
  await audit(auth, "export", "client", row.id, { size: result.zip.length });
  return new Response(new Uint8Array(result.zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": contentDisposition(result.filename), "Cache-Control": "no-store" },
  });
});

/** PATCH /:id/ai { excluded } — exclude clientul de la analiza AI (ex. la cererea lui sau prin contract) */
clientRoutes.patch("/:id/ai", async (c) => {
  const auth = c.get("auth");
  const row = await loadClient(auth.organizationId, uuidParam(c.req.param("id")));
  const { excluded } = z.object({ excluded: z.boolean() }).parse(await c.req.json());
  await db.update(clients).set({ aiExcluded: excluded, updatedAt: new Date() }).where(and(eq(clients.id, row.id), eq(clients.organizationId, auth.organizationId)));
  await audit(auth, excluded ? "ai_exclude" : "ai_include", "client", row.id);
  return c.json({ ok: true, aiExcluded: excluded });
});

/** PATCH /:id/responsible { userId } — schimbă doar avocatul responsabil */
clientRoutes.patch("/:id/responsible", async (c) => {
  const auth = c.get("auth");
  const row = await loadClient(auth.organizationId, uuidParam(c.req.param("id")));
  const { userId } = z.object({ userId: z.string().uuid().nullable() }).parse(await c.req.json());
  await checkResponsible(auth.organizationId, userId);
  await db.update(clients).set({ responsibleUserId: userId, updatedAt: new Date() })
    .where(and(eq(clients.id, row.id), eq(clients.organizationId, auth.organizationId)));
  await audit(auth, "assign", "client", row.id, { responsibleUserId: userId });
  return c.json({ ok: true });
});
