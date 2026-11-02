import type { Context, Next } from "hono";
import { verify, sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import type { AuthContext } from "../types/hono";

const TOKEN_TTL_S = 7 * 86400;
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
const lastActive = new Map<string, number>();

export function signToken(userId: string) {
  return sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S }, process.env.JWT_SECRET!, "HS256");
}

/** Citește utilizatorul din token; null dacă tokenul lipsește / e invalid / contul e dezactivat. */
export async function userFromRequest(c: Context) {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  try {
    const payload = await verify(token, process.env.JWT_SECRET!, "HS256");
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

  const now = Date.now();
  if (now - (lastActive.get(user.id) || 0) > ACTIVITY_THROTTLE_MS) {
    lastActive.set(user.id, now);
    db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id))
      .catch((e: Error) => console.warn("[auth] lastActiveAt:", e.message));
  }

  c.set("auth", {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
    name: user.name,
  } satisfies AuthContext);
  await next();
};
