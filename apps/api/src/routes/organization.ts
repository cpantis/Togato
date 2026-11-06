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
import { MIME, contentDisposition, detectKind } from "../services/storage/files";
import { enqueue } from "../jobs/queue";
import crypto from "crypto";
import { JUDETE, LEGAL_VERSION } from "@togato/shared";
import { legalAcceptances } from "../db/schema";
import { clientIp } from "../lib/clientIp";
import { CLOSURE_GRACE_DAYS, RETENTION_YEARS } from "../services/closure";
import { buildOrganizationZip } from "../services/dossierExport";
import { sendEmail, templates } from "../services/email";
import { frontendBaseUrl } from "../config";
import { and } from "drizzle-orm";

export const organizationRoutes = new Hono<AppEnv>();

function serialize(o: typeof organizations.$inferSelect) {
  return {
    id: o.id, name: o.name, plan: o.plan, status: o.status, trialEndsAt: o.trialEndsAt?.toISOString() ?? null, brandColor: o.brandColor, logoUrl: o.logoUrl,
    logoSrc: logoSrc(o), logoUploaded: !!o.logoKey,
    aiEnabled: o.aiEnabled, aiEnabledAt: o.aiEnabledAt?.toISOString() ?? null, require2fa: o.require2fa,
    directory: { listed: o.directoryListed, county: o.directoryCounty, city: o.directoryCity, description: o.directoryDescription, website: o.directoryWebsite, email: o.directoryEmail },
    legalVersion: o.legalVersion, legalCurrent: o.legalVersion === LEGAL_VERSION,
    closureScheduledFor: o.closureScheduledFor?.toISOString() ?? null, archivedRetentionYears: o.archivedRetentionYears,
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

/** POST /legal/accept { version } — un administrator acceptă versiunea curentă a documentelor juridice */
organizationRoutes.post("/legal/accept", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const { version } = z.object({ version: z.string().max(40) }).parse(await c.req.json());
  if (version !== LEGAL_VERSION) return c.json({ error: "Versiunea acceptată nu mai este cea curentă. Reîncărcați pagina.", code: "terms_outdated" }, 409);
  const [org] = await db.update(organizations).set({ legalVersion: LEGAL_VERSION, legalAcceptedAt: new Date(), legalAcceptedBy: auth.userId })
    .where(eq(organizations.id, auth.organizationId)).returning();
  await db.insert(legalAcceptances).values({ organizationId: auth.organizationId, userId: auth.userId, version: LEGAL_VERSION, ip: clientIp(c), userAgent: (c.req.header("user-agent") || "").slice(0, 300) || null });
  await audit(auth, "legal_accept", "organization", auth.organizationId, { version: LEGAL_VERSION });
  return c.json(serialize(org));
});

const admins = (organizationId: string) =>
  db.query.users.findMany({ where: and(eq(users.organizationId, organizationId), eq(users.role, "admin"), eq(users.status, "activ")) });

/** GET /export — exportul complet al cabinetului (toți clienții, echipa, jurnalul) */
organizationRoutes.get("/export", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const result = await buildOrganizationZip(auth.organizationId, auth.name);
  if (!result) return c.json({ error: "Cabinetul nu a fost găsit" }, 404);
  await audit(auth, "export", "organization", auth.organizationId, { size: result.zip.length });
  return new Response(new Uint8Array(result.zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": contentDisposition(result.filename), "Cache-Control": "no-store" },
  });
});

/** POST /closure { confirm } — programează ștergerea definitivă a cabinetului după perioada de grație */
organizationRoutes.post("/closure", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const { confirm } = z.object({ confirm: z.string().trim() }).parse(await c.req.json());
  const org = (await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId) }))!;
  if (confirm !== org.name) badRequest("Confirmați închiderea scriind exact numele cabinetului.");
  if (org.closureScheduledFor) return c.json(serialize(org));
  const subActive = org.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(org.subscriptionStatus ?? "") && !org.cancelAtPeriodEnd;
  if (subActive) return c.json({ error: "Anulați mai întâi abonamentul din portalul de facturare (Setări → Abonament), apoi cereți închiderea contului.", code: "subscription_active" }, 409);
  const now = new Date();
  const when = new Date(now.getTime() + CLOSURE_GRACE_DAYS * 86400_000);
  const [row] = await db.update(organizations).set({ closureRequestedAt: now, closureRequestedBy: auth.userId, closureScheduledFor: when, directoryListed: false })
    .where(eq(organizations.id, auth.organizationId)).returning();
  for (const a of await admins(auth.organizationId)) {
    await sendEmail(templates.closureScheduled({ to: a.email, name: a.name, orgName: org.name, date: when, url: `${frontendBaseUrl()}/settings#inchidere` }), { organizationId: auth.organizationId });
  }
  await audit(auth, "closure_request", "organization", auth.organizationId, { scheduledFor: when.toISOString() });
  return c.json(serialize(row));
});

/** DELETE /closure — anulează închiderea programată */
organizationRoutes.delete("/closure", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const [row] = await db.update(organizations).set({ closureRequestedAt: null, closureRequestedBy: null, closureScheduledFor: null })
    .where(eq(organizations.id, auth.organizationId)).returning();
  for (const a of await admins(auth.organizationId)) {
    await sendEmail(templates.closureCancelled({ to: a.email, name: a.name, orgName: row.name }), { organizationId: auth.organizationId });
  }
  await audit(auth, "closure_cancel", "organization", auth.organizationId);
  return c.json(serialize(row));
});

/** PUT /retention { years } — clienții arhivați se șterg după `years` ani (null = păstrare nelimitată) */
organizationRoutes.put("/retention", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const { years } = z.object({ years: z.union([z.null(), z.literal(RETENTION_YEARS as unknown as [number, ...number[]])]) }).parse(await c.req.json());
  const [row] = await db.update(organizations).set({ archivedRetentionYears: years }).where(eq(organizations.id, auth.organizationId)).returning();
  await audit(auth, "retention_policy", "organization", auth.organizationId, { years });
  return c.json(serialize(row));
});
