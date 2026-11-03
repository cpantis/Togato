import type { Context, Next } from "hono";
import { config } from "../config";

/** Limitare simplă în memorie (o singură instanță). Pentru mai multe instanțe: Redis. */
export function rateLimit({ windowMs, max, key }: { windowMs: number; max: number; key: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c: Context, next: Next) => {
    if (!config().RATE_LIMIT) return next();
    const ip = c.req.header("x-real-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const k = `${key}:${ip}`;
    const now = Date.now();
    const entry = hits.get(k);
    if (!entry || entry.resetAt < now) {
      hits.set(k, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10_000) {
        for (const [hk, v] of hits) if (v.resetAt < now) hits.delete(hk);
      }
    } else if (++entry.count > max) {
      return c.json({ error: "Prea multe cereri. Încearcă din nou peste un minut." }, 429);
    }
    await next();
  };
}
