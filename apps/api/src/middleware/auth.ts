import { log, logContext } from "../lib/logger";
import type { Context, Next } from "hono";
import { verify, sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations, users } from "../db/schema";
import type { AuthContext } from "../types/hono";

const TOKEN_TTL_S = 7 * 86400;
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
const lastActive = new Map<string, number>();

export function signToken(userId: string) {
  return sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S }, process.env.JWT_SECRET!, "HS256");
}

/** Token de scurtă durată emis după parolă, valabil doar pentru pasul al doilea al autentificării. */
export function signMfaToken(userId: string) {
  return sign({ sub: userId, purpose: "mfa", exp: Math.floor(Date.now() / 1000) + 5 * 60 }, process.env.JWT_SECRET!, "HS256");
}

export async function userFromMfaToken(token: string) {
  try {
    const payload = await verify(token, process.env.JWT_SECRET!, "HS256");
    if (payload.purpose !== "mfa") return null;
    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub as string) });
    return user && user.status === "activ" ? user : null;
  } catch {
    return null;
  }
}

/** Rute permise unui utilizator care trebuie întâi să-și activeze autentificarea în doi pași. */
const MFA_SETUP_ALLOWED = /^\/api\/account\//;

/** Citește utilizatorul din token; null dacă tokenul lipsește / e invalid / contul e dezactivat. */
export async function userFromRequest(c: Context) {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  try {
    const payload = await verify(token, process.env.JWT_SECRET!, "HS256");
    // tokenurile cu scop special (ex. pasul 2 al autentificării) nu sunt sesiuni
    if (payload.purpose) return null;
    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub as string) });
    if (!user || user.status !== "activ") return null;
    return user;
  } catch {
    return null;
  }
}

export const authMiddleware = async (c: Context, next: Next) => {
  const user = await userFromRequest(c);
  if (!user) return c.json({ error: "Sesiune expirată. Autentifică-te din nou." }, 401);

  // politica cabinetului: autentificarea în doi pași obligatorie
  if (!user.totpEnabled && !MFA_SETUP_ALLOWED.test(c.req.path)) {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId), columns: { require2fa: true } });
    if (org?.require2fa) {
      return c.json({ error: "Cabinetul cere autentificarea în doi pași. Activeaz-o din Setări → Securitate.", code: "2fa_required" }, 403);
    }
  }

  const now = Date.now();
  if (now - (lastActive.get(user.id) || 0) > ACTIVITY_THROTTLE_MS) {
    lastActive.set(user.id, now);
    db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id))
      .catch((e: Error) => log.warn("lastActiveAt nu s-a actualizat", { err: e.message }));
  }

  const ctx = logContext.getStore();
  if (ctx) Object.assign(ctx, { organizationId: user.organizationId, userId: user.id });
  c.set("auth", {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
    name: user.name,
  } satisfies AuthContext);
  await next();
};
