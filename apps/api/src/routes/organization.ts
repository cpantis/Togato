import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { requireAdmin } from "../middleware/requireAdmin";

export const organizationRoutes = new Hono<AppEnv>();

function serialize(o: typeof organizations.$inferSelect) {
  return { id: o.id, name: o.name, plan: o.plan, status: o.status, trialEndsAt: o.trialEndsAt?.toISOString() ?? null, brandColor: o.brandColor, logoUrl: o.logoUrl };
}

organizationRoutes.get("/", async (c) => {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, c.get("auth").organizationId) });
  return c.json(serialize(org!));
});

const updateSchema = z.object({
  name: z.string().trim().min(2, "Numele cabinetului e prea scurt").max(200),
  brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Culoarea trebuie să fie în formatul #RRGGBB").nullish().or(z.literal("")).transform((v) => (v ? v.toLowerCase() : null)),
  logoUrl: z.string().trim().max(500).url("Adresa logo-ului nu e validă").refine((u) => u.startsWith("https://"), "Logo-ul trebuie să fie pe o adresă https://").nullish().or(z.literal("")).transform((v) => (v ? v : null)),
});

organizationRoutes.put("/", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const body = updateSchema.parse(await c.req.json());
  const [org] = await db.update(organizations).set(body).where(eq(organizations.id, auth.organizationId)).returning();
  await audit(auth, "update", "organization", auth.organizationId, body);
  return c.json(serialize(org));
});
