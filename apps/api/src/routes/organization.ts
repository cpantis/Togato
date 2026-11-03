import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations, users } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { requireAdmin } from "../middleware/requireAdmin";
import { logoSrc } from "../lib/logo";
import { badRequest } from "../lib/http";
import { storage } from "../services/storage";
import { MIME, detectKind } from "../services/storage/files";
import { enqueue } from "../jobs/queue";
import crypto from "crypto";
import { JUDETE } from "@togato/shared";

export const organizationRoutes = new Hono<AppEnv>();

function serialize(o: typeof organizations.$inferSelect) {
  return {
    id: o.id, name: o.name, plan: o.plan, status: o.status, trialEndsAt: o.trialEndsAt?.toISOString() ?? null, brandColor: o.brandColor, logoUrl: o.logoUrl,
    logoSrc: logoSrc(o), logoUploaded: !!o.logoKey,
    aiEnabled: o.aiEnabled, aiEnabledAt: o.aiEnabledAt?.toISOString() ?? null, require2fa: o.require2fa,
    directory: { listed: o.directoryListed, county: o.directoryCounty, city: o.directoryCity, description: o.directoryDescription, website: o.directoryWebsite, email: o.directoryEmail },
    supportAccessUntil: o.supportAccessUntil && o.supportAccessUntil > new Date() ? o.supportAccessUntil.toISOString() : null,
  };
}

organizationRoutes.get("/", async (c) => {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, c.get("auth").organizationId) });
  return c.json(serialize(org!));
});

const updateSchema = z.object({
  name: z.string().trim().min(2, "Numele cabinetului e prea scurt").max(200),
  brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Culoarea trebuie să fie în formatul #RRGGBB").nullish().or(z.literal("")).transform((v) => (v ? v.toLowerCase() : null)),
  logoUrl: z.string().trim().max(500).url("Adresa logo-ului nu e validă").refine((u) => u.startsWith("https://"), "Logo-ul trebuie să fie pe o adresă https://").nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  aiEnabled: z.boolean().optional(),
  require2fa: z.boolean().optional(),
});

organizationRoutes.put("/", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const body = updateSchema.parse(await c.req.json());
  const current = (await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId) }))!;
  if (body.require2fa && !current.require2fa) {
    const me = await db.query.users.findFirst({ where: eq(users.id, auth.userId), columns: { totpEnabled: true } });
    if (!me?.totpEnabled) return c.json({ error: "Activați întâi autentificarea în doi pași pentru propriul cont (Setări → Securitate)." }, 400);
  }
  const { aiEnabled, require2fa, ...rest } = body;
  const [org] = await db.update(organizations).set({
    ...rest,
    ...(require2fa !== undefined ? { require2fa } : {}),
    ...(aiEnabled !== undefined && aiEnabled !== current.aiEnabled
      ? { aiEnabled, aiEnabledBy: aiEnabled ? auth.userId : null, aiEnabledAt: aiEnabled ? new Date() : null }
      : {}),
  }).where(eq(organizations.id, auth.organizationId)).returning();
  await audit(auth, "update", "organization", auth.organizationId, body);
  return c.json(serialize(org));
});

/** POST /logo (multipart „file”) — PNG, JPG sau WebP, maximum 1 MB. SVG nu (poate conține scripturi). */
organizationRoutes.post("/logo", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) badRequest("Alegeți o imagine.");
  if (file.size > 1024 * 1024) badRequest("Imaginea depășește 1 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = detectKind(buf, file.name);
  if (kind !== "png" && kind !== "jpeg" && kind !== "webp") badRequest("Logo-ul trebuie să fie PNG, JPG sau WebP.");
  const current = (await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId) }))!;
  const key = `${auth.organizationId}/logo/${crypto.randomUUID()}`;
  await storage().put(key, buf, MIME[kind]);
  const [org] = await db.update(organizations).set({ logoKey: key, logoContentType: MIME[kind] }).where(eq(organizations.id, auth.organizationId)).returning();
  if (current.logoKey) await enqueue("storage.delete", { keys: [current.logoKey] }, { organizationId: auth.organizationId });
  await audit(auth, "logo_upload", "organization", auth.organizationId, { size: buf.length });
  return c.json(serialize(org));
});

organizationRoutes.delete("/logo", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const current = (await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId) }))!;
  const [org] = await db.update(organizations).set({ logoKey: null, logoContentType: null }).where(eq(organizations.id, auth.organizationId)).returning();
  if (current.logoKey) await enqueue("storage.delete", { keys: [current.logoKey] }, { organizationId: auth.organizationId });
  await audit(auth, "logo_delete", "organization", auth.organizationId);
  return c.json(serialize(org));
});

/**
 * POST /support-access { hours } — permite echipei Togato să vadă (doar în citire) datele cabinetului,
 * pentru rezolvarea unei probleme. Expiră automat; se poate retrage oricând.
 */
organizationRoutes.post("/support-access", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const { hours } = z.object({ hours: z.union([z.literal(24), z.literal(72), z.literal(168)]) }).parse(await c.req.json());
  const until = new Date(Date.now() + hours * 3600_000);
  const [org] = await db.update(organizations).set({ supportAccessUntil: until, supportAccessGrantedBy: auth.userId }).where(eq(organizations.id, auth.organizationId)).returning();
  await audit(auth, "support_access_grant", "organization", auth.organizationId, { hours, until: until.toISOString() });
  return c.json(serialize(org));
});

organizationRoutes.delete("/support-access", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const [org] = await db.update(organizations).set({ supportAccessUntil: null, supportAccessGrantedBy: null }).where(eq(organizations.id, auth.organizationId)).returning();
  await audit(auth, "support_access_revoke", "organization", auth.organizationId);
  return c.json(serialize(org));
});

/** PUT /directory — profilul cabinetului în directorul văzut de firmele care își fac autoevaluarea */
organizationRoutes.put("/directory", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
  const body = z.object({
    listed: z.boolean(),
    county: z.enum(JUDETE).nullish().transform((v) => v ?? null),
    city: opt(100),
    description: opt(600),
    website: z.string().trim().max(300).url("Adresa site-ului nu e validă").refine((u) => /^https?:\/\//.test(u), "Adresa trebuie să înceapă cu https://").nullish().or(z.literal("")).transform((v) => (v ? v : null)),
    email: z.string().trim().toLowerCase().email("Email invalid").max(200).nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  }).refine((b) => !b.listed || b.county, { message: "Alegeți județul în care activează cabinetul", path: ["county"] })
    .parse(await c.req.json());
  const [org] = await db.update(organizations).set({
    directoryListed: body.listed, directoryCounty: body.county, directoryCity: body.city,
    directoryDescription: body.description, directoryWebsite: body.website, directoryEmail: body.email,
  }).where(eq(organizations.id, auth.organizationId)).returning();
  await audit(auth, "directory_update", "organization", auth.organizationId, { listed: body.listed, county: body.county });
  return c.json(serialize(org));
});
