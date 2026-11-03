/** Fișiere publice (fără autentificare): logo-ul cabinetului, afișat și în portalul clientului. */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { storage } from "../services/storage";

export const publicFileRoutes = new Hono();

publicFileRoutes.get("/logo/:orgId", async (c) => {
  const id = c.req.param("orgId");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Nu există" }, 404);
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, id), columns: { logoKey: true, logoContentType: true } });
  if (!org?.logoKey || !org.logoContentType) return c.json({ error: "Nu există" }, 404);
  const body = await storage().get(org.logoKey);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": org.logoContentType,
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
});
