import { Hono } from "hono";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { notFound, uuidParam } from "../lib/http";
import { loadDocContext } from "../services/documents/common";
import { listDocuments, renderDocument } from "../services/documents";

/** Montat la /api/clients — /:id/documents */
export const documentRoutes = new Hono<AppEnv>();

documentRoutes.get("/:id/documents", async (c) => {
  const auth = c.get("auth");
  const ctx = await loadDocContext(auth.organizationId, uuidParam(c.req.param("id")), auth.name);
  if (!ctx) notFound("Clientul nu a fost găsit");
  return c.json({ data: listDocuments(ctx) });
});

documentRoutes.get("/:id/documents/:type", async (c) => {
  const auth = c.get("auth");
  const clientId = uuidParam(c.req.param("id"));
  const systemId = c.req.query("systemId");
  const ctx = await loadDocContext(auth.organizationId, clientId, auth.name);
  if (!ctx) notFound("Clientul nu a fost găsit");

  const result = await renderDocument(ctx, c.req.param("type"), systemId);
  if ("error" in result) return c.json({ error: result.error }, result.status);

  await audit(auth, "generate", "document", clientId, { type: c.req.param("type"), systemId: systemId ?? null });
  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      "Cache-Control": "no-store",
    },
  });
});
