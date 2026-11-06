/**
 * Starea operațională: coada de joburi, joburile zilnice, backup-ul. Folosită de consola platformei
 * (`GET /api/platform/status`) și de jobul orar `monitoring.check`, care alertează administratorii platformei.
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { rootDb as db } from "../db";
import { emailSuppressions, jobs, opsEvents } from "../db/schema";
import { monitorBackups } from "../config";

export const DAILY_JOBS = ["reminders.daily", "maintenance.prune", "trial.reminders", "closure.daily"] as const;
const H = 3600_000;

export interface SystemStatus {
  checkedAt: string;
  queue: { pending: number; running: number; overdue: number; oldestOverdueMinutes: number | null; failedLastHour: number; failedLast24h: number; failedByType: Record<string, number> };
  daily: Record<string, string | null>;
  backup: { lastOkAt: string | null; lastFailedAt: string | null; ageHours: number | null; expected: boolean };
  emailSuppressions: number;
  problems: string[];
}

export async function systemStatus(now = new Date()): Promise<SystemStatus> {
  const iso = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const overdueBefore = iso(10 * 60_000);
  const [q] = await db.select({
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    running: sql<number>`count(*) filter (where status = 'running')::int`,
    overdue: sql<number>`count(*) filter (where status = 'pending' and run_at < ${overdueBefore}::timestamptz)::int`,
    oldest: sql<string | null>`min(run_at) filter (where status = 'pending' and run_at < ${overdueBefore}::timestamptz)`,
    failedLastHour: sql<number>`count(*) filter (where status = 'failed' and finished_at >= ${iso(H)}::timestamptz)::int`,
    failedLast24h: sql<number>`count(*) filter (where status = 'failed' and finished_at >= ${iso(24 * H)}::timestamptz)::int`,
  }).from(jobs);
  const byType = await db.select({ type: jobs.type, n: sql<number>`count(*)::int` }).from(jobs)
    .where(and(eq(jobs.status, "failed"), gte(jobs.finishedAt, new Date(now.getTime() - 24 * H)))).groupBy(jobs.type);

  const daily: Record<string, string | null> = {};
  for (const type of DAILY_JOBS) {
    const [r] = await db.select({ at: jobs.finishedAt }).from(jobs).where(and(eq(jobs.type, type), eq(jobs.status, "done"))).orderBy(desc(jobs.finishedAt)).limit(1);
    daily[type] = r?.at?.toISOString() ?? null;
  }
  const [okB] = await db.select({ at: opsEvents.createdAt }).from(opsEvents).where(and(eq(opsEvents.kind, "backup"), eq(opsEvents.status, "ok"))).orderBy(desc(opsEvents.createdAt)).limit(1);
  const [badB] = await db.select({ at: opsEvents.createdAt }).from(opsEvents).where(and(eq(opsEvents.kind, "backup"), eq(opsEvents.status, "failed"))).orderBy(desc(opsEvents.createdAt)).limit(1);
  const [{ n: suppressed }] = await db.select({ n: sql<number>`count(*)::int` }).from(emailSuppressions);

  const oldest = q.oldest ? new Date(q.oldest) : null;
  const status: SystemStatus = {
    checkedAt: now.toISOString(),
    queue: {
      pending: q.pending, running: q.running, overdue: q.overdue,
      oldestOverdueMinutes: oldest ? Math.round((now.getTime() - oldest.getTime()) / 60_000) : null,
      failedLastHour: q.failedLastHour, failedLast24h: q.failedLast24h,
      failedByType: Object.fromEntries(byType.map((b) => [b.type, b.n])),
    },
    daily,
    backup: { lastOkAt: okB?.at.toISOString() ?? null, lastFailedAt: badB?.at.toISOString() ?? null, ageHours: okB ? Math.round((now.getTime() - okB.at.getTime()) / H) : null, expected: monitorBackups() },
    emailSuppressions: suppressed,
    problems: [],
  };
  status.problems = findProblems(status, now);
  return status;
}

/** regulile de alertare (pure, testate) */
export function findProblems(s: Omit<SystemStatus, "problems">, now = new Date()): string[] {
  const p: string[] = [];
  if (s.queue.overdue >= 20 || (s.queue.oldestOverdueMinutes ?? 0) >= 30) p.push(`Coada de joburi întârzie: ${s.queue.overdue} joburi așteaptă de peste 10 minute (cel mai vechi: ${s.queue.oldestOverdueMinutes} min). Verificați workerul.`);
  if (s.queue.failedLastHour > 0) p.push(`${s.queue.failedLastHour} joburi au eșuat definitiv în ultima oră (${Object.entries(s.queue.failedByType).map(([t, n]) => `${t}: ${n}`).join(", ")}).`);
  for (const [type, at] of Object.entries(s.daily)) {
    if (at && now.getTime() - Date.parse(at) > 26 * H) p.push(`Jobul zilnic ${type} nu a mai rulat de ${Math.round((now.getTime() - Date.parse(at)) / H)} de ore.`);
  }
  if (s.backup.expected) {
    if (!s.backup.lastOkAt) p.push("Nu există niciun backup reușit înregistrat. Verificați serviciul de backup.");
    else if ((s.backup.ageHours ?? 0) > 26) p.push(`Ultimul backup reușit e de acum ${s.backup.ageHours} de ore.`);
    if (s.backup.lastFailedAt && (!s.backup.lastOkAt || s.backup.lastFailedAt > s.backup.lastOkAt)) p.push(`Ultimul backup a eșuat (${s.backup.lastFailedAt}).`);
  }
  return p;
}

/** curăță evenimentele vechi (păstrate 90 de zile) */
export async function pruneOpsEvents(now = new Date()) {
  await db.delete(opsEvents).where(lt(opsEvents.createdAt, new Date(now.getTime() - 90 * 24 * H)));
}
