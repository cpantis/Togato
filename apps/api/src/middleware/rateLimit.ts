/**
 * Limitarea cererilor per IP, cu contoare în Postgres — comune tuturor instanțelor API.
 * Fereastră fixă; o singură instrucțiune atomică per cerere (INSERT ... ON CONFLICT).
 */
import type { Context, Next } from "hono";
import { sql } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { clientIp } from "../lib/clientIp";
import { log } from "../lib/logger";

export async function hit(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
  const rows = await db.execute<{ count: number; reset_at: string }>(sql`
    insert into rate_limits (key, count, reset_at) values (${key}, 1, now() + (${windowMs} * interval '1 millisecond'))
    on conflict (key) do update set
      count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
    returning count, reset_at`);
  const row = (rows as unknown as { count: number; reset_at: string }[])[0];
  return { count: Number(row.count), resetAt: new Date(row.reset_at) };
}

export function rateLimit({ windowMs, max, key }: { windowMs: number; max: number; key: string }) {
  return async (c: Context, next: Next) => {
    if (!config().RATE_LIMIT) return next();
    let result: { count: number; resetAt: Date };
    try {
      result = await hit(`${key}:${clientIp(c)}`, windowMs);
    } catch (e) {
      // dacă baza de date nu răspunde, nu blocăm cererea doar din cauza limitatorului
      log.warn("limitatorul de cereri nu a putut citi contorul", { err: (e as Error).message });
      return next();
    }
    const remaining = Math.max(0, max - result.count);
    c.header("RateLimit-Limit", String(max));
    c.header("RateLimit-Remaining", String(remaining));
    if (result.count > max) {
      const retry = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
      c.header("Retry-After", String(retry));
      return c.json({ error: "Prea multe cereri. Încearcă din nou peste un minut." }, 429);
    }
    await next();
  };
}

export async function pruneRateLimits() {
  await db.execute(sql`delete from rate_limits where reset_at < now() - interval '1 hour'`);
}
