/** Sesiuni server-side: creare, citire (cu prelungire), revocare. Cookie httpOnly + token CSRF. */
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import crypto from "crypto";
import { db, type Tx } from "../db";
import { sessions, users } from "../db/schema";
import { config } from "../config";
import { hashToken, newToken } from "../lib/tokens";
import { clientIp } from "../lib/clientIp";

export const SESSION_COOKIE = "togato_session";
export const CSRF_COOKIE = "togato_csrf";
/** inactivitate după care sesiunea expiră */
export const IDLE_TTL_MS = 7 * 86400_000;
/** durata maximă a unei sesiuni, indiferent de activitate */
export const ABSOLUTE_TTL_MS = 30 * 86400_000;
const TOUCH_THROTTLE_MS = 5 * 60_000;

function secure() {
  return config().NODE_ENV === "production";
}

export async function createSession(c: Context, user: { id: string; organizationId: string }, tx?: Tx): Promise<string> {
  const { token, hash } = newToken();
  await (tx ?? db).insert(sessions).values({
    userId: user.id,
    organizationId: user.organizationId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + IDLE_TTL_MS),
    ip: clientIp(c),
    userAgent: (c.req.header("user-agent") || "").slice(0, 300) || null,
  });
  const maxAge = Math.floor(ABSOLUTE_TTL_MS / 1000);
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: secure(), sameSite: "Lax", path: "/", maxAge });
  // tokenul CSRF e citit de JavaScript și trimis în antetul X-CSRF-Token (double submit)
  setCookie(c, CSRF_COOKIE, crypto.randomBytes(24).toString("base64url"), { httpOnly: false, secure: secure(), sameSite: "Lax", path: "/", maxAge });
  return token;
}

export function clearSessionCookies(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: secure() });
  deleteCookie(c, CSRF_COOKIE, { path: "/", secure: secure() });
}

/** tokenul de sesiune: din cookie (browser) sau din antetul Authorization: Bearer (clienți API, teste) */
export function sessionTokenFrom(c: Context): { token: string; via: "cookie" | "bearer" } | null {
  const bearer = c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) return { token: bearer, via: "bearer" };
  const cookie = getCookie(c, SESSION_COOKIE);
  return cookie ? { token: cookie, via: "cookie" } : null;
}

export async function resolveSession(token: string) {
  if (token.length > 200) return null;
  const now = new Date();
  const [row] = await db.select({ session: sessions, user: users }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || row.user.status !== "activ") return null;
  if (now.getTime() - row.session.createdAt.getTime() > ABSOLUTE_TTL_MS) return null;
  if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_THROTTLE_MS) {
    const capped = Math.min(now.getTime() + IDLE_TTL_MS, row.session.createdAt.getTime() + ABSOLUTE_TTL_MS);
    await db.update(sessions).set({ lastSeenAt: now, expiresAt: new Date(capped) }).where(eq(sessions.id, row.session.id));
  }
  return row;
}

export async function revokeSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** deconectează toate sesiunile utilizatorului (opțional, cu excepția celei curente) */
export async function revokeUserSessions(userId: string, exceptSessionId?: string, tx?: Tx) {
  await (tx ?? db).delete(sessions).where(exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId));
}

export async function pruneExpiredSessions() {
  await db.delete(sessions).where(sql`${sessions.expiresAt} < now() or ${sessions.createdAt} < now() - (${ABSOLUTE_TTL_MS} * interval '1 millisecond')`);
}
