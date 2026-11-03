import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { clients, invitations, organizations, users } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { badRequest, notFound, uuidParam } from "../lib/http";
import { newToken } from "../lib/tokens";
import { requireAdmin } from "../middleware/requireAdmin";
import { frontendBaseUrl } from "../config";
import { sendEmail, templates } from "../services/email";

export const teamRoutes = new Hono<AppEnv>();

const INVITE_DAYS = 7;

function inviteUrl(token: string) {
  return `${frontendBaseUrl()}/invite/${token}`;
}

/** GET / — membrii cabinetului + invitațiile în așteptare (vizibil tuturor membrilor) */
teamRoutes.get("/", async (c) => {
  const { organizationId, role } = c.get("auth");
  const members = await db.select({
    id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, totpEnabled: users.totpEnabled,
    lastActiveAt: users.lastActiveAt, createdAt: users.createdAt,
    clientsCount: sql<number>`count(${clients.id})::int`,
  }).from(users)
    .leftJoin(clients, and(eq(clients.responsibleUserId, users.id), eq(clients.organizationId, organizationId)))
    .where(eq(users.organizationId, organizationId))
    .groupBy(users.id)
    .orderBy(asc(users.name));

  const pending = role === "admin"
    ? await db.select({ id: invitations.id, email: invitations.email, name: invitations.name, role: invitations.role, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
      .from(invitations)
      .where(and(eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
      .orderBy(desc(invitations.createdAt))
    : [];

  return c.json({
    members: members.map((m) => ({ ...m, lastActiveAt: m.lastActiveAt?.toISOString() ?? null, createdAt: m.createdAt.toISOString() })),
    invitations: pending.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
  });
});

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalid"),
  name: z.string().trim().max(120).nullish().transform((v) => (v ? v : null)),
  role: z.enum(["admin", "membru"]).default("membru"),
  /** trimite linkul și pe email (implicit da); linkul se întoarce oricum, pentru copiere */
  sendEmail: z.boolean().default(true),
});

/** POST /invitations — creează o invitație și întoarce linkul (o singură dată) */
teamRoutes.post("/invitations", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const body = inviteSchema.parse(await c.req.json());
  const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  if (existing) {
    return c.json({ error: existing.organizationId === auth.organizationId ? "Această persoană e deja membră a cabinetului" : "Există deja un cont Togato cu acest email" }, 409);
  }
  // O invitație nouă o înlocuiește pe cea veche pentru același email
  await db.delete(invitations).where(and(eq(invitations.organizationId, auth.organizationId), eq(invitations.email, body.email), isNull(invitations.acceptedAt)));
  const { token, hash } = newToken();
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId), columns: { name: true } });
  const inv = await db.transaction(async (tx) => {
    const [row] = await tx.insert(invitations).values({
      organizationId: auth.organizationId,
      email: body.email,
      name: body.name,
      role: body.role,
      tokenHash: hash,
      invitedBy: auth.userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000),
    }).returning();
    if (body.sendEmail) {
      await sendEmail(templates.invitation({ to: body.email, orgName: org?.name ?? "Togato", inviterName: auth.name, url: inviteUrl(token), expiresDays: INVITE_DAYS }), { tx, organizationId: auth.organizationId });
    }
    await audit(auth, "invite", "invitation", row.id, { email: body.email, role: body.role, emailed: body.sendEmail }, tx);
    return row;
  });
  return c.json({ id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt.toISOString(), url: inviteUrl(token), emailed: body.sendEmail }, 201);
});

teamRoutes.delete("/invitations/:id", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const id = uuidParam(c.req.param("id"));
  const deleted = await db.delete(invitations).where(and(eq(invitations.id, id), eq(invitations.organizationId, auth.organizationId))).returning({ id: invitations.id });
  if (!deleted.length) notFound("Invitația nu a fost găsită");
  await audit(auth, "revoke", "invitation", id);
  return c.body(null, 204);
});

const memberSchema = z.object({
  role: z.enum(["admin", "membru"]).optional(),
  status: z.enum(["activ", "dezactivat"]).optional(),
});

/** PATCH /members/:id — schimbă rolul sau dezactivează un cont */
teamRoutes.patch("/members/:id", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const id = uuidParam(c.req.param("id"));
  const body = memberSchema.parse(await c.req.json());
  const member = await db.query.users.findFirst({ where: and(eq(users.id, id), eq(users.organizationId, auth.organizationId)) });
  if (!member) notFound("Membrul nu a fost găsit");

  const losesAdmin = member.role === "admin" && member.status === "activ" && (body.role === "membru" || body.status === "dezactivat");
  if (losesAdmin) {
    if (id === auth.userId) badRequest("Nu îți poți retrage singur drepturile de administrator. Cere altui administrator.");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users)
      .where(and(eq(users.organizationId, auth.organizationId), eq(users.role, "admin"), eq(users.status, "activ"), ne(users.id, id)));
    if (n === 0) badRequest("Cabinetul trebuie să aibă cel puțin un administrator activ.");
  }
  if (body.status === "dezactivat" && id === auth.userId) badRequest("Nu îți poți dezactiva propriul cont.");

  await db.update(users).set({ ...(body.role ? { role: body.role } : {}), ...(body.status ? { status: body.status } : {}) })
    .where(and(eq(users.id, id), eq(users.organizationId, auth.organizationId)));
  await audit(auth, "update", "user", id, body);
  return c.json({ ok: true });
});

/** POST /members/:id/reset-2fa — un administrator dezactivează 2FA pentru un coleg care și-a pierdut telefonul */
teamRoutes.post("/members/:id/reset-2fa", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const id = uuidParam(c.req.param("id"));
  if (id === auth.userId) badRequest("Pentru propriul cont folosiți Setări → Securitate.");
  const member = await db.query.users.findFirst({ where: and(eq(users.id, id), eq(users.organizationId, auth.organizationId)) });
  if (!member) notFound("Membrul nu a fost găsit");
  await db.update(users).set({ totpEnabled: false, totpSecret: null, totpPendingSecret: null, totpLastStep: null, recoveryCodes: null, totpEnabledAt: null })
    .where(and(eq(users.id, id), eq(users.organizationId, auth.organizationId)));
  await audit(auth, "2fa_reset", "user", id, { member: member.email });
  return c.json({ ok: true });
});
