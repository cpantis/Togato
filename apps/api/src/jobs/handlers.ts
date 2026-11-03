/** Tipurile de joburi și handlerele lor. */
import { and, eq, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { RULESET_VERSION, classifyAiSystem, normalizeAnswers } from "@togato/shared";
import { db } from "../db";
import { aiSystems, auditLog, clients, obligations, organizations, users } from "../db/schema";
import { frontendBaseUrl } from "../config";
import { log } from "../lib/logger";
import { deliver, sendEmail, templates, type EmailMessage } from "../services/email";
import { generateMemo, memoAvailable } from "../services/memo";
import { reclassifyOutdated } from "../services/reclassify";
import { PermanentJobError, enqueue, pruneFinished, type JobHandler } from "./queue";
import { pruneExpiredSessions } from "../services/sessions";
import { storage } from "../services/storage";
import { pruneRateLimits } from "../middleware/rateLimit";

// ─── email ───────────────────────────────────────────────
const emailSend: JobHandler = async (payload: EmailMessage) => {
  await deliver(payload);
};

// ─── memoriul AI ─────────────────────────────────────────
export interface MemoJob { organizationId: string; aiSystemId: string; userId: string }

const memoGenerate: JobHandler & { onFinalFailure?: JobHandler } = async (p: MemoJob) => {
  const s = await db.query.aiSystems.findFirst({
    where: and(eq(aiSystems.id, p.aiSystemId), eq(aiSystems.organizationId, p.organizationId)),
    with: { client: true },
  });
  if (!s) throw new PermanentJobError("Sistemul a fost șters");
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, p.organizationId), columns: { aiEnabled: true } });
  if (!org?.aiEnabled) throw new PermanentJobError("Analiza AI a fost dezactivată pentru cabinet.");
  if (!memoAvailable()) throw new PermanentJobError("Analiza AI nu e configurată pe server.");
  const answers = normalizeAnswers(s.answers);
  let memo;
  try {
    memo = await generateMemo({
      clientName: s.client.name,
      caen: s.client.caen,
      caenDescription: s.client.caenDescription,
      system: { name: s.name, vendor: s.vendor, description: s.description, purpose: s.purpose, department: s.department },
      answers,
      classification: s.classification ?? classifyAiSystem(answers),
    });
  } catch (e) {
    // mesajele „Analiza ...” sunt refuzuri ale modelului / răspunsuri goale — nu se reiau la nesfârșit
    if ((e as Error).message?.startsWith("Analiza")) throw new PermanentJobError((e as Error).message);
    throw e;
  }
  await db.update(aiSystems).set({ aiMemo: memo.text, aiMemoCitations: memo.citations, aiMemoAt: new Date(), aiMemoStatus: "gata", aiMemoError: null })
    .where(and(eq(aiSystems.id, s.id), eq(aiSystems.organizationId, p.organizationId)));
  await db.insert(auditLog).values({ organizationId: p.organizationId, userId: p.userId, action: "memo", entity: "ai_system", entityId: s.id, details: { citations: memo.citations.length } });
};
memoGenerate.onFinalFailure = async (p: MemoJob, job) => {
  const last = await db.execute<{ last_error: string | null }>(sql`select last_error from jobs where id = ${job.id}`);
  const raw = (last as unknown as { last_error: string | null }[])[0]?.last_error ?? "";
  const message = raw.startsWith("Analiza") ? raw : "Serviciul AI nu a răspuns. Reîncercați peste câteva minute.";
  await db.update(aiSystems).set({ aiMemoStatus: "esuat", aiMemoError: message })
    .where(and(eq(aiSystems.id, p.aiSystemId), eq(aiSystems.organizationId, p.organizationId)));
};

// ─── reîncadrarea după schimbarea regulilor ──────────────
const rulesetReclassify: JobHandler = async () => {
  const r = await reclassifyOutdated();
  if (r.skipped) throw new Error("altă instanță reîncadrează acum — se reia");
  if (r.processed) log.info("reîncadrare după schimbarea regulilor", { ...r, version: RULESET_VERSION });
};

// ─── notificare la trimiterea din portal ─────────────────
export interface PortalNotifyJob { organizationId: string; aiSystemId: string }

const portalNotify: JobHandler = async (p: PortalNotifyJob) => {
  const s = await db.query.aiSystems.findFirst({
    where: and(eq(aiSystems.id, p.aiSystemId), eq(aiSystems.organizationId, p.organizationId)),
    with: { client: true },
  });
  if (!s) return; // retras între timp de client
  const recipients = await notificationRecipients(p.organizationId, s.client.responsibleUserId, "notifyPortal");
  const biometrics = !!(s.portalAnswers as { biometrics?: boolean } | null)?.biometrics;
  for (const u of recipients) {
    await sendEmail(templates.portalSubmission({
      to: u.email,
      clientName: s.client.name,
      systemName: s.name,
      submittedBy: s.submittedByName ?? "Clientul",
      url: `${frontendBaseUrl()}/systems/${s.id}`,
      needsBiometricReview: biometrics,
    }), { organizationId: p.organizationId, dedupeKey: `portal-notify:${s.id}:${u.id}` });
  }
};

/** responsabilul clientului (dacă e activ și vrea notificări), altfel administratorii activi ai cabinetului */
async function notificationRecipients(organizationId: string, responsibleUserId: string | null, pref: "notifyPortal" | "notifyDeadlines") {
  if (responsibleUserId) {
    const u = await db.query.users.findFirst({ where: and(eq(users.id, responsibleUserId), eq(users.organizationId, organizationId), eq(users.status, "activ")) });
    if (u) return u[pref] ? [u] : [];
  }
  const admins = await db.query.users.findMany({ where: and(eq(users.organizationId, organizationId), eq(users.role, "admin"), eq(users.status, "activ")) });
  return admins.filter((a) => a[pref]);
}

// ─── rezumatul zilnic al termenelor ──────────────────────
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const remindersDaily: JobHandler = async (p: { date?: string }) => {
  const today = p.date ?? isoDate(new Date());
  const horizon = isoDate(new Date(Date.parse(today) + 7 * 86400_000));
  const rows = await db.select({
    organizationId: obligations.organizationId,
    obligationId: obligations.id,
    title: obligations.title,
    dueDate: obligations.dueDate,
    clientId: clients.id,
    clientName: clients.name,
    responsibleUserId: clients.responsibleUserId,
  }).from(obligations)
    .innerJoin(clients, eq(clients.id, obligations.clientId))
    .innerJoin(organizations, eq(organizations.id, obligations.organizationId))
    .where(and(
      isNotNull(obligations.dueDate),
      lte(obligations.dueDate, horizon),
      inArray(obligations.status, ["de_facut", "in_lucru"]),
      ne(organizations.status, "suspendat"),
      isNull(clients.archivedAt),
    ));

  // grupare pe destinatar: responsabilul clientului sau, în lipsă, administratorii
  const byUser = new Map<string, { email: string; name: string; organizationId: string; items: { client: string; title: string; dueDate: string; overdue: boolean; url: string }[] }>();
  const recipientCache = new Map<string, Awaited<ReturnType<typeof notificationRecipients>>>();
  for (const r of rows) {
    const key = `${r.organizationId}:${r.responsibleUserId ?? "-"}`;
    if (!recipientCache.has(key)) recipientCache.set(key, await notificationRecipients(r.organizationId, r.responsibleUserId, "notifyDeadlines"));
    for (const u of recipientCache.get(key)!) {
      const entry = byUser.get(u.id) ?? { email: u.email, name: u.name, organizationId: r.organizationId, items: [] };
      entry.items.push({ client: r.clientName, title: r.title, dueDate: r.dueDate!, overdue: r.dueDate! < today, url: `${frontendBaseUrl()}/clients/${r.clientId}` });
      byUser.set(u.id, entry);
    }
  }
  for (const [userId, u] of byUser) {
    u.items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    await sendEmail(templates.deadlineDigest({ to: u.email, name: u.name, items: u.items, dashboardUrl: `${frontendBaseUrl()}/dashboard` }),
      { organizationId: u.organizationId, dedupeKey: `deadline-digest:${today}:${userId}` });
  }
  log.info("rezumat termene", { date: today, recipients: byUser.size, obligations: rows.length });
};

// ─── ștergerea fișierelor din stocare (după ștergerea rândurilor) ──
const storageDelete: JobHandler = async (p: { keys: string[] }) => {
  if (p.keys?.length) await storage().delete(p.keys);
};

const maintenancePrune: JobHandler = async () => {
  await pruneFinished();
  await pruneExpiredSessions();
  await pruneRateLimits();
  await db.execute(sql`delete from password_resets where expires_at < now() - interval '1 day'`);
};

export const handlers: Record<string, JobHandler> = {
  "email.send": emailSend,
  "memo.generate": memoGenerate,
  "ruleset.reclassify": rulesetReclassify,
  "portal.notify": portalNotify,
  "reminders.daily": remindersDaily,
  "maintenance.prune": maintenancePrune,
  "storage.delete": storageDelete,
};

/** programările zilnice — idempotente prin dedupeKey; apelate periodic de worker */
export async function scheduleRecurring(now = new Date()) {
  const day = isoDate(now);
  // 05:00 UTC = 07:00/08:00 în România
  const at = new Date(`${day}T05:00:00Z`);
  await enqueue("reminders.daily", { date: day }, { dedupeKey: `reminders:${day}`, runAt: at, maxAttempts: 3 });
  await enqueue("maintenance.prune", {}, { dedupeKey: `prune:${day}`, runAt: at, maxAttempts: 2 });
}

/** la pornire: reîncadrează o singură dată per versiune a regulilor */
export function scheduleReclassification() {
  return enqueue("ruleset.reclassify", { version: RULESET_VERSION }, { dedupeKey: `reclassify:${RULESET_VERSION}`, maxAttempts: 10 });
}
