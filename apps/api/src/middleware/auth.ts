import { log, logContext } from "../lib/logger";
import type { Context, Next } from "hono";
import { verify, sign } from "hono/jwt";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { RollbackSignal, db, withTenant } from "../db";
import { organizations, users } from "../db/schema";
import type { AuthContext } from "../types/hono";
import { CSRF_COOKIE, resolveSession, sessionTokenFrom } from "../services/sessions";
import { stateOf } from "../services/billing";
import { LEGAL_VERSION } from "@togato/shared";
import { requireAdmin2fa, requireEmailVerification } from "../config";

const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
const lastActive = new Map<string, number>();
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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
/** rute permise indiferent de starea abonamentului: contul propriu și facturarea */
const BILLING_ALWAYS = /^\/api\/(account|billing|platform)(\/|$)/;
/** rute permise înainte de acceptarea termenilor actualizați */
const LEGAL_ALWAYS = /^\/api\/(account|billing|platform|organization\/legal)(\/|$)/;

/**
 * Protecție CSRF pentru sesiunile din cookie: cererile care modifică date trebuie să trimită
 * antetul X-CSRF-Token egal cu cookie-ul togato_csrf (un alt site nu poate citi cookie-ul).
 * Cererile cu Authorization: Bearer nu au nevoie — browserul nu le trimite automat.
 */
export function csrfOk(c: Context, via: "cookie" | "bearer"): boolean {
  if (via === "bearer" || SAFE_METHODS.has(c.req.method)) return true;
  const cookie = getCookie(c, CSRF_COOKIE);
  const header = c.req.header("x-csrf-token");
  if (!cookie || !header || cookie.length !== header.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
}

/** Citește sesiunea și utilizatorul; null dacă lipsesc / au expirat / contul e dezactivat. */
export async function sessionFromRequest(c: Context) {
  const found = sessionTokenFrom(c);
  if (!found) return null;
  const row = await resolveSession(found.token);
  return row ? { ...row, via: found.via, token: found.token } : null;
}

export const authMiddleware = async (c: Context, next: Next) => {
  const s = await sessionFromRequest(c);
  if (!s) return c.json({ error: "Sesiune expirată. Autentifică-te din nou." }, 401);
  if (!csrfOk(c, s.via)) return c.json({ error: "Cerere respinsă (token CSRF lipsă sau invalid). Reîncărcați pagina.", code: "csrf" }, 403);
  const user = s.user;

  // starea abonamentului: suspendat = blocat; expirat = doar citire (și export), facturarea rămâne accesibilă
  const state = stateOf(s.org);
  if (!BILLING_ALWAYS.test(c.req.path)) {
    if (state === "suspendat") return c.json({ error: "Contul cabinetului este suspendat. Contactați echipa Togato.", code: "suspended" }, 403);
    if (state === "expirat" && !SAFE_METHODS.has(c.req.method)) {
      return c.json({ error: "Perioada de probă sau abonamentul a expirat. Datele rămân disponibile pentru consultare și export; pentru modificări, alegeți un abonament din Setări.", code: "subscription_required" }, 402);
    }
  }

  // adresa de email trebuie confirmată (în producție); contul propriu rămâne accesibil pentru retrimitere
  if (requireEmailVerification() && !user.emailVerifiedAt && !MFA_SETUP_ALLOWED.test(c.req.path)) {
    return c.json({ error: `Confirmați adresa de email (${user.email}) cu linkul primit. Îl puteți retrimite din ecranul de confirmare.`, code: "email_unverified" }, 403);
  }
  // termenii actualizați: până la acceptarea lor de un administrator, modificările sunt blocate
  if (s.org.legalVersion !== LEGAL_VERSION && !SAFE_METHODS.has(c.req.method) && !LEGAL_ALWAYS.test(c.req.path)) {
    return c.json({ error: user.role === "admin" ? "Termenii Togato au fost actualizați. Citiți și acceptați noua versiune pentru a continua." : "Termenii Togato au fost actualizați. Un administrator al cabinetului trebuie să accepte noua versiune.", code: "terms_required" }, 403);
  }

  // administratorii trebuie să aibă 2FA (în producție)
  if (requireAdmin2fa() && user.role === "admin" && !user.totpEnabled && !MFA_SETUP_ALLOWED.test(c.req.path)) {
    return c.json({ error: "Administratorii trebuie să activeze autentificarea în doi pași. Activați-o din Setări → Securitate.", code: "2fa_required" }, 403);
  }

  // politica cabinetului: autentificarea în doi pași obligatorie
  if (!user.totpEnabled && !MFA_SETUP_ALLOWED.test(c.req.path)) {
    const org = s.org;
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
    sessionId: s.session.id,
  } satisfies AuthContext);

  // restul cererii rulează sub Row-Level Security, într-o singură tranzacție:
  // la eroare (inclusiv 4xx aruncate), modificările parțiale se anulează
  try {
    await withTenant(user.organizationId, async () => {
      await next();
      if (c.error) throw new RollbackSignal();
    });
  } catch (e) {
    if (!(e instanceof RollbackSignal)) throw e;
  }
};
