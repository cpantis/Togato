import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { clients, organizations, portalLinks } from "../db/schema";
import { hashToken } from "./tokens";

/** Găsește clientul și cabinetul pentru un token de portal valid; null altfel. */
export async function resolvePortalToken(token: string | undefined) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const link = await db.query.portalLinks.findFirst({
    where: and(eq(portalLinks.tokenHash, hashToken(token)), gt(portalLinks.expiresAt, new Date())),
  });
  if (!link) return null;
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, link.clientId), eq(clients.organizationId, link.organizationId)) });
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, link.organizationId) });
  if (!client || !org || org.status === "suspendat") return null;
  return { link, client, org };
}
