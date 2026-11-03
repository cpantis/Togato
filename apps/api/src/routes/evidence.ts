/**
 * Dovezile atașate obligațiilor. Montate la /api: /obligations/:id/evidence și /evidence/:id.
 * Fișierul se validează după conținut, se stochează sub o cheie aleatoare și se servește
 * mereu ca descărcare (niciodată randat inline).
 */
import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { db } from "../db";
import { evidence, obligations } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { badRequest, notFound, uuidParam } from "../lib/http";
import { storage } from "../services/storage";
import { MIME, contentDisposition, detectKind, safeFilename } from "../services/storage/files";
import { enqueue } from "../jobs/queue";
import { log } from "../lib/logger";

export const evidenceRoutes = new Hono<AppEnv>();

export const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;
const MAX_PER_OBLIGATION = 50;

export function serializeEvidence(e: typeof evidence.$inferSelect & { uploadedByName?: string | null }) {
  return {
    id: e.id, obligationId: e.obligationId, fileName: e.fileName, contentType: e.contentType, size: e.size,
    sha256: e.sha256, note: e.note, uploadedByName: e.uploadedByName ?? null, createdAt: e.createdAt.toISOString(),
  };
}

async function loadObligation(organizationId: string, id: string) {
  const row = await db.query.obligations.findFirst({ where: and(eq(obligations.id, id), eq(obligations.organizationId, organizationId)) });
  if (!row) notFound("Obligația nu a fost găsită");
  return row;
}

evidenceRoutes.get("/obligations/:id/evidence", async (c) => {
  const auth = c.get("auth");
  const obl = await loadObligation(auth.organizationId, uuidParam(c.req.param("id")));
  const rows = await db.query.evidence.findMany({
    where: and(eq(evidence.obligationId, obl.id), eq(evidence.organizationId, auth.organizationId)),
    orderBy: asc(evidence.createdAt),
    with: { uploader: { columns: { name: true } } },
  });
  return c.json({ data: rows.map((r) => serializeEvidence({ ...r, uploadedByName: r.uploader?.name })) });
});

/** POST multipart: file (obligatoriu), note (opțional) */
evidenceRoutes.post("/obligations/:id/evidence", async (c) => {
  const auth = c.get("auth");
  const obl = await loadObligation(auth.organizationId, uuidParam(c.req.param("id")));
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) badRequest("Alegeți un fișier.");
  if (file.size === 0) badRequest("Fișierul e gol.");
  if (file.size > MAX_EVIDENCE_BYTES) badRequest("Fișierul depășește 15 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = safeFilename(file.name);
  const kind = detectKind(buf, fileName);
  if (!kind) badRequest("Tip de fișier nepermis. Acceptăm PDF, imagini (PNG, JPG, WebP), Word, Excel, PowerPoint, ODT, TXT și CSV.");
  const note = typeof form.note === "string" ? form.note.trim().slice(0, 1000) || null : null;

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(evidence).where(and(eq(evidence.obligationId, obl.id), eq(evidence.organizationId, auth.organizationId)));
  if (n >= MAX_PER_OBLIGATION) badRequest(`Maximum ${MAX_PER_OBLIGATION} fișiere per obligație.`);

  const key = `${auth.organizationId}/evidence/${crypto.randomUUID()}`;
  await storage().put(key, buf, MIME[kind]);
  try {
    const [row] = await db.insert(evidence).values({
      organizationId: auth.organizationId, clientId: obl.clientId, obligationId: obl.id,
      fileName, contentType: MIME[kind], size: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      storageKey: key, note, uploadedBy: auth.userId,
    }).returning();
    await audit(auth, "upload", "evidence", row.id, { obligation: obl.code, fileName, size: buf.length });
    return c.json(serializeEvidence({ ...row, uploadedByName: auth.name }), 201);
  } catch (e) {
    await storage().delete([key]).catch((err) => log.warn("fișier orfan după eșec", { key, err: (err as Error).message }));
    throw e;
  }
});

evidenceRoutes.get("/evidence/:id", async (c) => {
  const auth = c.get("auth");
  const row = await db.query.evidence.findFirst({ where: and(eq(evidence.id, uuidParam(c.req.param("id"))), eq(evidence.organizationId, auth.organizationId)) });
  if (!row) notFound("Fișierul nu a fost găsit");
  const body = await storage().get(row.storageKey);
  await audit(auth, "download", "evidence", row.id, { fileName: row.fileName });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": row.contentType,
      "Content-Disposition": contentDisposition(row.fileName),
      "Content-Length": String(body.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

evidenceRoutes.delete("/evidence/:id", async (c) => {
  const auth = c.get("auth");
  const id = uuidParam(c.req.param("id"));
  const [row] = await db.delete(evidence).where(and(eq(evidence.id, id), eq(evidence.organizationId, auth.organizationId))).returning();
  if (!row) notFound("Fișierul nu a fost găsit");
  // fișierul se șterge din stocare după confirmarea tranzacției (jobul e în aceeași tranzacție)
  await enqueue("storage.delete", { keys: [row.storageKey] }, { organizationId: auth.organizationId });
  await audit(auth, "delete", "evidence", row.id, { fileName: row.fileName });
  return c.body(null, 204);
});
