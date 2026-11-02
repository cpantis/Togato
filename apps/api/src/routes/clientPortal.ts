/** Administrarea linkului de portal de către cabinet — montat la /api/clients */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { clients, portalLinks } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { notFound, uuidParam } from "../lib/http";
import { newToken } from "../lib/tokens";

export const clientPortalRoutes = new Hono<AppEnv>();

const LINK_DAYS = 90;

function portalUrl(token: string) {
  const base = (process.env.FRONTEND_URL || "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "");
  return `${base}/portal/${token}`;
}

async function ensureClient(organizationId: string, id: string) {
  const row = await db.query.clients.findFirst({ where: and(eq(clients.id, id), eq(clients.organizationId, organizationId)) });
  if (!row) notFound("Clientul nu a fost găsit");
  return row;
}

clientPortalRoutes.get("/:id/portal", async (c) => {
  const auth = c.get("auth");
  const client = await ensureClient(auth.organizationId, uuidParam(c.req.param("id")));
  const link = await db.query.portalLinks.findFirst({ where: and(eq(portalLinks.clientId, client.id), eq(portalLinks.organizationId, auth.organizationId)) });
  const active = !!link && link.expiresAt > new Date();
  return c.json({
    active,
    expired: !!link && !active,
    createdAt: link?.createdAt.toISOString() ?? null,
    expiresAt: link?.expiresAt.toISOString() ?? null,
    lastUsedAt: link?.lastUsedAt?.toISOString() ?? null,
  });
});

/** POST — creează un link nou; dacă exista unul, îl înlocuiește (vechiul nu mai funcționează) */
clientPortalRoutes.post("/:id/portal", async (c) => {
  const auth = c.get("auth");
  const client = await ensureClient(auth.organizationId, uuidParam(c.req.param("id")));
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86400_000);
  await db.transaction(async (tx) => {
    await tx.delete(portalLinks).where(and(eq(portalLinks.clientId, client.id), eq(portalLinks.organizationId, auth.organizationId)));
    await tx.insert(portalLinks).values({ organizationId: auth.organizationId, clientId: client.id, tokenHash: hash, createdBy: auth.userId, expiresAt });
  });
  await audit(auth, "portal_link", "client", client.id);
  return c.json({ url: portalUrl(token), expiresAt: expiresAt.toISOString() }, 201);
});

clientPortalRoutes.delete("/:id/portal", async (c) => {
  const auth = c.get("auth");
  const client = await ensureClient(auth.organizationId, uuidParam(c.req.param("id")));
  await db.delete(portalLinks).where(and(eq(portalLinks.clientId, client.id), eq(portalLinks.organizationId, auth.organizationId)));
  await audit(auth, "portal_revoke", "client", client.id);
  return c.body(null, 204);
});
