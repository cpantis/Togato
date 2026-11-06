/**
 * Webhook-ul Resend (/api/email/webhook, public): respingerile permanente și reclamațiile de spam
 * adaugă adresa în `email_suppressions`, ca să nu mai trimitem acolo. Semnătura (Svix) e verificată.
 */
import { Hono } from "hono";
import crypto from "crypto";
import { rootDb as db } from "../db";
import { emailSuppressions } from "../db/schema";
import { config } from "../config";
import { log } from "../lib/logger";

export const emailWebhookRoutes = new Hono();

const TOLERANCE_S = 5 * 60;

/** verificarea semnăturii Svix: HMAC-SHA256(secret, `${id}.${timestamp}.${body}`), antet „v1,<base64> …” */
export function verifySvix(secret: string, headers: { id?: string; timestamp?: string; signature?: string }, body: string, now = Date.now()): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

interface ResendEvent { type: string; data?: { to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string } } }

emailWebhookRoutes.post("/webhook", async (c) => {
  const secret = config().RESEND_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "Webhook-ul nu e configurat" }, 404);
  const body = await c.req.text();
  const ok = verifySvix(secret, { id: c.req.header("svix-id"), timestamp: c.req.header("svix-timestamp"), signature: c.req.header("svix-signature") }, body);
  if (!ok) return c.json({ error: "Semnătură invalidă" }, 400);
  let ev: ResendEvent;
  try { ev = JSON.parse(body); } catch { return c.json({ error: "JSON invalid" }, 400); }

  const to = (Array.isArray(ev.data?.to) ? ev.data!.to : ev.data?.to ? [ev.data.to] : []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  let reason: string | null = null;
  if (ev.type === "email.complained") reason = "spam";
  // doar respingerile permanente (adresă inexistentă); cele temporare (cutie plină) se reîncearcă
  else if (ev.type === "email.bounced" && (ev.data?.bounce?.type ?? "Permanent").toLowerCase() !== "transient") reason = "respins";
  if (reason && to.length) {
    const detail = ev.data?.bounce?.message?.slice(0, 500) ?? null;
    await db.insert(emailSuppressions).values(to.map((email) => ({ email, reason, detail }))).onConflictDoNothing();
    log.warn("adresă de email blocată", { reason, count: to.length });
  }
  return c.json({ ok: true });
});
