/**
 * Trimiterea emailurilor: adaptor `log` (dezvoltare/teste — scrie în jurnal și păstrează
 * ultimele mesaje în memorie) sau `resend` (API HTTP). Emailurile se trimit doar din joburi
 * (`email.send`), ca o cădere a furnizorului să nu blocheze cererea și să fie reîncercată.
 */
import { eq } from "drizzle-orm";
import { config } from "../../config";
import { rootDb } from "../../db";
import { emailSuppressions } from "../../db/schema";
import { log } from "../../lib/logger";
import { enqueue, PermanentJobError, type EnqueueOptions } from "../../jobs/queue";
import type { EmailMessage } from "./templates";

export { templates } from "./templates";
export type { EmailMessage } from "./templates";

const outbox: EmailMessage[] = [];
/** ultimele emailuri „trimise” cu adaptorul log — pentru teste și dezvoltare */
export function sentEmails(): readonly EmailMessage[] { return outbox; }
export function _clearOutbox() { outbox.length = 0; }

export async function deliver(msg: EmailMessage): Promise<void> {
  const cfg = config();
  // adresele care au respins definitiv mesajele sau le-au marcat ca spam: nu mai trimitem (reputația domeniului)
  const [suppressed] = await rootDb.select({ reason: emailSuppressions.reason }).from(emailSuppressions).where(eq(emailSuppressions.email, msg.to.trim().toLowerCase())).limit(1);
  if (suppressed) {
    log.info("email nelivrat: adresă blocată", { to: msg.to, reason: suppressed.reason, subject: msg.subject });
    return;
  }
  if (cfg.EMAIL_PROVIDER === "log") {
    outbox.push(msg);
    if (outbox.length > 200) outbox.shift();
    log.info("email (adaptor log)", { to: msg.to, subject: msg.subject });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.replyTo }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return;
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  // 4xx (în afară de 429) = mesaj invalid; nu are rost reîncercarea
  if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new PermanentJobError(`Resend ${res.status}: ${detail}`);
  throw new Error(`Resend ${res.status}: ${detail}`);
}

/** pune emailul în coadă (în tranzacția dată, dacă există — se trimite doar dacă operația reușește) */
export function sendEmail(msg: EmailMessage, opts: EnqueueOptions = {}) {
  return enqueue("email.send", { ...msg }, { maxAttempts: 6, ...opts });
}
