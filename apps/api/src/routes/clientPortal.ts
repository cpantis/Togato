/** Administrarea linkului de portal de către cabinet — montat la /api/clients */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { clients, organizations, portalLinks, users } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { notFound, uuidParam } from "../lib/http";
import { newToken } from "../lib/tokens";
import { z } from "zod";
import { frontendBaseUrl } from "../config";
import { sendEmail, templates } from "../services/email";

export const clientPortalRoutes = new Hono<AppEnv>();

const LINK_DAYS = 90;

function portalUrl(token: string) {
  return `${frontendBaseUrl()}/portal/${token}`;
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
  // opțional: linkul se trimite direct clientului pe email (altfel avocatul îl copiază)
  const raw = await c.req.text();
  const body = z.object({
    sendTo: z.string().trim().toLowerCase().email("Email invalid").max(200).nullish(),
    message: z.string().trim().max(2000).nullish(),
  }).parse(raw ? JSON.parse(raw) : {});
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86400_000);
  const url = portalUrl(token);
  const [org, sender] = await Promise.all([
    db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId), columns: { name: true, brandColor: true } }),
    db.query.users.findFirst({ where: eq(users.id, auth.userId), columns: { email: true } }),
  ]);
  await db.transaction(async (tx) => {
    await tx.delete(portalLinks).where(and(eq(portalLinks.clientId, client.id), eq(portalLinks.organizationId, auth.organizationId)));
    await tx.insert(portalLinks).values({ organizationId: auth.organizationId, clientId: client.id, tokenHash: hash, createdBy: auth.userId, expiresAt });
    if (body.sendTo) {
      await sendEmail(templates.portalLink({
        to: body.sendTo, clientName: client.name, orgName: org?.name ?? "Cabinetul", url, expiresAt,
        message: body.message, replyTo: sender?.email, brandColor: org?.brandColor,
      }), { tx, organizationId: auth.organizationId });
    }
    await audit(auth, "portal_link", "client", client.id, body.sendTo ? { sentTo: body.sendTo } : undefined, tx);
  });
  return c.json({ url, expiresAt: expiresAt.toISOString(), sentTo: body.sendTo ?? null }, 201);
});

clientPortalRoutes.delete("/:id/portal", async (c) => {
  const auth = c.get("auth");
  const client = await ensureClient(auth.organizationId, uuidParam(c.req.param("id")));
  await db.delete(portalLinks).where(and(eq(portalLinks.clientId, client.id), eq(portalLinks.organizationId, auth.organizationId)));
  await audit(auth, "portal_revoke", "client", client.id);
  return c.body(null, 204);
});
