import { Hono } from "hono";
import { TRIAL_DAYS } from "@togato/shared";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Context } from "hono";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { invitations, organizations, passwordResets, users } from "../db/schema";
import { hashToken, newToken } from "../lib/tokens";
import { csrfOk, sessionFromRequest, signMfaToken, userFromMfaToken } from "../middleware/auth";
import { checkSecondFactor } from "../services/mfa";
import { clearSessionCookies, createSession, revokeSession, revokeUserSessions } from "../services/sessions";
import { sendEmail, templates } from "../services/email";
import { frontendBaseUrl } from "../config";
import { clientIp } from "../lib/clientIp";
import { log } from "../lib/logger";
import { logoSrc } from "../lib/logo";
import { stateOf } from "../services/billing";
import { LEGAL_VERSION } from "@togato/shared";
import { legalAcceptances } from "../db/schema";
import { requireAdmin2fa, requireEmailVerification } from "../config";
import type { Tx } from "../db";
import { isPlatformAdmin } from "../services/platform";

export const authRoutes = new Hono();

/** după MAX_FAILED încercări eșuate consecutive (parolă sau cod), contul se blochează LOCK_MINUTES */
export const MAX_FAILED = 10;
export const LOCK_MINUTES = 15;
const RESET_MINUTES = 60;
const LOCKED = (until: Date) => ({ error: `Prea multe încercări eșuate. Contul e blocat temporar până la ${until.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" })}. Puteți reseta parola.`, code: "locked" });

function isLocked(u: { lockedUntil: Date | null }) {
  return !!u.lockedUntil && u.lockedUntil > new Date();
}

/** crește contorul atomic; la prag, blochează contul */
async function registerFailure(userId: string) {
  const [row] = await db.update(users).set({
    failedLogins: sql`${users.failedLogins} + 1`,
    lockedUntil: sql`case when ${users.failedLogins} + 1 >= ${MAX_FAILED} then now() + (${LOCK_MINUTES} * interval '1 minute') else ${users.lockedUntil} end`,
  }).where(eq(users.id, userId)).returning({ failedLogins: users.failedLogins, lockedUntil: users.lockedUntil });
  if (row?.failedLogins === MAX_FAILED) log.warn("cont blocat temporar", { userId });
  return row;
}

async function registerSuccess(userId: string) {
  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastActiveAt: new Date() }).where(eq(users.id, userId));
}

/** răspunsul cu sesiune nouă: cookie httpOnly + tokenul în corp (pentru clienți API) */
async function sessionResponse(c: Context, user: typeof users.$inferSelect, org: typeof organizations.$inferSelect | null | undefined, status: 200 | 201 = 200, extra: Record<string, unknown> = {}) {
  const token = await createSession(c, user);
  return c.json({ token, user: publicUser(user), organization: org ? publicOrg(org) : null, ...extra }, status);
}


// Hash real, folosit când emailul nu există — timpul de răspuns nu dezvăluie dacă un cont există
const DUMMY_HASH = bcrypt.hashSync("togato-dummy-password", 12);

function publicUser(u: typeof users.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: u.organizationId, totpEnabled: u.totpEnabled, platformAdmin: isPlatformAdmin(u.email), emailVerified: !!u.emailVerifiedAt,
    // 2FA cerut acum: politica administratorilor (producție)
    twoFactorRequired: requireAdmin2fa() && u.role === "admin" && !u.totpEnabled };
}

function publicOrg(o: typeof organizations.$inferSelect) {
  return { id: o.id, name: o.name, plan: o.plan, status: o.status, trialEndsAt: o.trialEndsAt?.toISOString() ?? null, brandColor: o.brandColor, logoUrl: o.logoUrl, logoSrc: logoSrc(o), aiEnabled: o.aiEnabled, require2fa: o.require2fa, billingState: stateOf(o), legalVersion: o.legalVersion, legalCurrent: o.legalVersion === LEGAL_VERSION, closureScheduledFor: o.closureScheduledFor?.toISOString() ?? null };
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "Numele e prea scurt").max(120),
  email: z.string().trim().toLowerCase().email("Email invalid"),
  password: z.string().min(8, "Parola trebuie să aibă cel puțin 8 caractere").max(200),
  cabinetName: z.string().trim().min(2, "Numele cabinetului e prea scurt").max(200),
  /** acceptarea termenilor, a politicii de confidențialitate și a DPA, în versiunea curentă */
  acceptTerms: z.literal(true, { message: "Acceptați termenii, politica de confidențialitate și acordul de prelucrare a datelor" }),
  legalVersion: z.string().max(40).optional(),
  captchaToken: z.string().max(4000).optional(),
});

const VERIFY_DAYS = 7;

/** emite un link nou de confirmare a emailului (îl invalidează pe cel vechi) */
export async function issueEmailVerification(user: { id: string; email: string; name: string; organizationId: string }, tx?: Tx) {
  const { token, hash } = newToken();
  const runner = tx ?? db;
  await runner.update(users).set({ emailVerifyTokenHash: hash }).where(eq(users.id, user.id));
  await sendEmail(templates.verifyEmail({ to: user.email, name: user.name, url: `${frontendBaseUrl()}/confirmare-email/${token}` }), { tx, organizationId: user.organizationId });
}

authRoutes.post("/signup", async (c) => {
  const body = signupSchema.parse(await c.req.json());
  const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  if (existing) return c.json({ error: "Există deja un cont cu acest email" }, 409);

  if (body.legalVersion && body.legalVersion !== LEGAL_VERSION) return c.json({ error: "Termenii au fost actualizați între timp. Reîncărcați pagina și citiți versiunea nouă.", code: "terms_outdated" }, 409);
  const passwordHash = await bcrypt.hash(body.password, 12);
  const now = new Date();
  const { user, org } = await db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({
      name: body.cabinetName,
      status: "trial",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400_000),
      legalVersion: LEGAL_VERSION, legalAcceptedAt: now,
    }).returning();
    const [user] = await tx.insert(users).values({
      organizationId: org.id,
      email: body.email,
      name: body.name,
      passwordHash,
      role: "admin",
      // fără obligația de confirmare (dezvoltare, teste), adresa e considerată confirmată
      emailVerifiedAt: requireEmailVerification() ? null : now,
    }).returning();
    await tx.update(organizations).set({ legalAcceptedBy: user.id }).where(eq(organizations.id, org.id));
    await tx.insert(legalAcceptances).values({ organizationId: org.id, userId: user.id, version: LEGAL_VERSION, ip: clientIp(c), userAgent: (c.req.header("user-agent") || "").slice(0, 300) || null });
    if (requireEmailVerification()) await issueEmailVerification(user, tx);
    return { user, org };
  });

  return sessionResponse(c, user, org, 201);
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalid"),
  password: z.string().min(1),
});

authRoutes.post("/login", async (c) => {
  const body = loginSchema.parse(await c.req.json());
  const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  // contul blocat nu acceptă nici parola corectă (altfel blocarea n-ar opri ghicirea)
  if (user && isLocked(user)) return c.json(LOCKED(user.lockedUntil!), 429);
  if (!user || !ok) {
    if (user) {
      const r = await registerFailure(user.id);
      if (r?.lockedUntil && r.lockedUntil > new Date()) return c.json(LOCKED(r.lockedUntil), 429);
    }
    return c.json({ error: "Email sau parolă incorectă" }, 401);
  }
  if (user.status !== "activ") return c.json({ error: "Contul este dezactivat" }, 403);

  // pasul al doilea: sesiunea se emite abia după codul din aplicația de autentificare
  if (user.totpEnabled) {
    return c.json({ mfaRequired: true, mfaToken: await signMfaToken(user.id) });
  }

  await registerSuccess(user.id);
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) });
  return sessionResponse(c, user, org);
});

/** POST /login/mfa { mfaToken, code } — al doilea pas: cod TOTP sau cod de recuperare */
authRoutes.post("/login/mfa", async (c) => {
  const body = z.object({ mfaToken: z.string().min(10).max(2000), code: z.string().trim().min(6).max(20) }).parse(await c.req.json());
  const user = await userFromMfaToken(body.mfaToken);
  if (!user) return c.json({ error: "Sesiunea de autentificare a expirat. Introduceți din nou parola." }, 401);
  if (isLocked(user)) return c.json(LOCKED(user.lockedUntil!), 429);
  const result = await checkSecondFactor(user, body.code);
  if (!result.ok) {
    const r = await registerFailure(user.id);
    if (r?.lockedUntil && r.lockedUntil > new Date()) return c.json(LOCKED(r.lockedUntil), 429);
    return c.json({ error: "Cod incorect sau deja folosit" }, 401);
  }

  await registerSuccess(user.id);
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) });
  return sessionResponse(c, user, org, 200, result.usedRecovery ? { recoveryCodesLeft: result.recoveryLeft } : {});
});

authRoutes.get("/me", async (c) => {
  const s = await sessionFromRequest(c);
  if (!s) return c.json({ error: "Neautentificat" }, 401);
  const user = s.user;
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
      // invitația a ajuns pe această adresă: e confirmată
      emailVerifiedAt: new Date(),
    }).returning();
    return u;
  });
  if (!user) return c.json({ error: "Invitația a fost deja folosită." }, 409);
  return sessionResponse(c, user, org, 201);
});

/** POST /logout — închide sesiunea curentă */
authRoutes.post("/logout", async (c) => {
  const s = await sessionFromRequest(c);
  if (s && !csrfOk(c, s.via)) return c.json({ error: "Cerere respinsă (token CSRF)", code: "csrf" }, 403);
  if (s) await revokeSession(s.token);
  clearSessionCookies(c);
  return c.body(null, 204);
});

/**
 * POST /password/forgot { email } — trimite un link de resetare. Răspunsul e mereu același,
 * ca să nu se poată afla ce adrese au cont.
 */
authRoutes.post("/password/forgot", async (c) => {
  const body = z.object({ email: z.string().trim().toLowerCase().email("Email invalid") }).parse(await c.req.json());
  const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  if (user && user.status === "activ") {
    const { token, hash } = newToken();
    await db.transaction(async (tx) => {
      // un singur link valabil per utilizator
      await tx.delete(passwordResets).where(eq(passwordResets.userId, user.id));
      await tx.insert(passwordResets).values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });
      await sendEmail(templates.passwordReset({ to: user.email, name: user.name, url: `${frontendBaseUrl()}/reset/${token}`, expiresMinutes: RESET_MINUTES }), { tx, organizationId: user.organizationId });
    });
    log.info("cerere de resetare a parolei", { userId: user.id, ip: clientIp(c) });
  }
  return c.json({ ok: true, message: "Dacă există un cont cu această adresă, am trimis un link de resetare. Verificați emailul (și dosarul Spam)." });
});

const resetSchema = z.object({
  token: z.string().min(10).max(100),
  password: z.string().min(8, "Parola trebuie să aibă cel puțin 8 caractere").max(200),
});

/** POST /password/reset { token, password } — parola nouă; toate sesiunile existente se închid */
authRoutes.post("/password/reset", async (c) => {
  const body = resetSchema.parse(await c.req.json());
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await db.transaction(async (tx) => {
    // folosire unică, condiționată — două cereri simultane nu pot folosi același link
    const [reset] = await tx.update(passwordResets).set({ usedAt: new Date() })
      .where(and(eq(passwordResets.tokenHash, hashToken(body.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
      .returning();
    if (!reset) return null;
    const [u] = await tx.update(users).set({ passwordHash, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null })
      .where(and(eq(users.id, reset.userId), eq(users.status, "activ"))).returning();
    if (!u) return null;
    await revokeUserSessions(u.id, undefined, tx);
    await sendEmail(templates.passwordChanged({ to: u.email, name: u.name }), { tx, organizationId: u.organizationId });
    return u;
  });
  if (!user) return c.json({ error: "Linkul de resetare nu mai este valabil. Cereți unul nou." }, 400);
  log.info("parolă resetată", { userId: user.id, ip: clientIp(c) });
  // după resetare, utilizatorul se autentifică normal (inclusiv cu al doilea pas, dacă îl are)
  return c.json({ ok: true, mfaRequired: user.totpEnabled });
});

/** POST /verify-email { token } — confirmă adresa (linkul din email); funcționează și fără sesiune */
authRoutes.post("/verify-email", async (c) => {
  const { token } = z.object({ token: z.string().min(20).max(100) }).parse(await c.req.json());
  const [u] = await db.update(users).set({ emailVerifiedAt: new Date(), emailVerifyTokenHash: null })
    .where(and(eq(users.emailVerifyTokenHash, hashToken(token)), isNull(users.emailVerifiedAt), gt(users.createdAt, new Date(Date.now() - VERIFY_DAYS * 86400_000))))
    .returning({ id: users.id });
  if (!u) return c.json({ error: "Linkul de confirmare nu mai este valabil. Autentificați-vă și cereți unul nou." }, 400);
  return c.json({ ok: true });
});
