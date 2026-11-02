import { Hono } from "hono";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { invitations, organizations, users } from "../db/schema";
import { hashToken } from "../lib/tokens";
import { signToken, userFromRequest } from "../middleware/auth";

export const authRoutes = new Hono();

const TRIAL_DAYS = 14;
// Hash real, folosit când emailul nu există — timpul de răspuns nu dezvăluie dacă un cont există
const DUMMY_HASH = bcrypt.hashSync("togato-dummy-password", 12);

function publicUser(u: typeof users.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: u.organizationId };
}

function publicOrg(o: typeof organizations.$inferSelect) {
  return { id: o.id, name: o.name, plan: o.plan, status: o.status, trialEndsAt: o.trialEndsAt?.toISOString() ?? null };
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "Numele e prea scurt").max(120),
  email: z.string().trim().toLowerCase().email("Email invalid"),
  password: z.string().min(8, "Parola trebuie să aibă cel puțin 8 caractere").max(200),
  cabinetName: z.string().trim().min(2, "Numele cabinetului e prea scurt").max(200),
});

authRoutes.post("/signup", async (c) => {
  const body = signupSchema.parse(await c.req.json());
  const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  if (existing) return c.json({ error: "Există deja un cont cu acest email" }, 409);

  const passwordHash = await bcrypt.hash(body.password, 12);
  const { user, org } = await db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({
      name: body.cabinetName,
      status: "trial",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400_000),
    }).returning();
    const [user] = await tx.insert(users).values({
      organizationId: org.id,
      email: body.email,
      name: body.name,
      passwordHash,
      role: "admin",
    }).returning();
    return { user, org };
  });

  return c.json({ token: await signToken(user.id), user: publicUser(user), organization: publicOrg(org) }, 201);
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalid"),
  password: z.string().min(1),
});

authRoutes.post("/login", async (c) => {
  const body = loginSchema.parse(await c.req.json());
  const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return c.json({ error: "Email sau parolă incorectă" }, 401);
  if (user.status !== "activ") return c.json({ error: "Contul este dezactivat" }, 403);

  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) });
  return c.json({ token: await signToken(user.id), user: publicUser(user), organization: org ? publicOrg(org) : null });
});

authRoutes.get("/me", async (c) => {
  const user = await userFromRequest(c);
  if (!user) return c.json({ error: "Neautentificat" }, 401);
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) });
  return c.json({ user: publicUser(user), organization: org ? publicOrg(org) : null });
});

async function findInvitation(token: string) {
  if (!token || token.length > 100) return null;
  const inv = await db.query.invitations.findFirst({
    where: and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())),
  });
  if (!inv) return null;
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, inv.organizationId) });
  return org ? { inv, org } : null;
}

/** GET /invitation/:token — detaliile unei invitații valide (pagina de acceptare) */
authRoutes.get("/invitation/:token", async (c) => {
  const found = await findInvitation(c.req.param("token"));
  if (!found) return c.json({ error: "Invitația nu mai este valabilă. Cere administratorului cabinetului una nouă." }, 404);
  return c.json({ email: found.inv.email, name: found.inv.name, role: found.inv.role, cabinetName: found.org.name });
});

const acceptSchema = z.object({
  token: z.string().min(10).max(100),
  name: z.string().trim().min(2, "Numele e prea scurt").max(120),
  password: z.string().min(8, "Parola trebuie să aibă cel puțin 8 caractere").max(200),
});

/** POST /accept-invitation — creează contul colegului și îl autentifică */
authRoutes.post("/accept-invitation", async (c) => {
  const body = acceptSchema.parse(await c.req.json());
  const found = await findInvitation(body.token);
  if (!found) return c.json({ error: "Invitația nu mai este valabilă. Cere administratorului cabinetului una nouă." }, 404);
  const { inv, org } = found;
  const existing = await db.query.users.findFirst({ where: eq(users.email, inv.email) });
  if (existing) return c.json({ error: "Există deja un cont cu acest email. Autentifică-te." }, 409);

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await db.transaction(async (tx) => {
    // Marcăm invitația ca folosită condiționat — două acceptări simultane nu pot crea două conturi
    const claimed = await tx.update(invitations).set({ acceptedAt: new Date() })
      .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt))).returning({ id: invitations.id });
    if (!claimed.length) return null;
    const [u] = await tx.insert(users).values({
      organizationId: inv.organizationId, email: inv.email, name: body.name, passwordHash, role: inv.role,
    }).returning();
    return u;
  });
  if (!user) return c.json({ error: "Invitația a fost deja folosită." }, 409);
  return c.json({ token: await signToken(user.id), user: publicUser(user), organization: publicOrg(org) }, 201);
});
