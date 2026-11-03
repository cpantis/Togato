/**
 * Coadă de joburi pe Postgres. Mai mulți workeri pot rula în paralel: un job e preluat
 * de unul singur (FOR UPDATE SKIP LOCKED). Eșecurile se reiau cu întârziere exponențială;
 * joburile rămase „running” după o cădere a procesului sunt eliberate după STALE_MS.
 */
import { sql } from "drizzle-orm";
import { db, type Tx } from "../db";
import { jobs } from "../db/schema";
import { log, logContext, serializeError } from "../lib/logger";
import { reportError } from "../lib/errorReporting";

export const STALE_MS = 10 * 60_000;

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  /** cheie unică: un al doilea job cu aceeași cheie e ignorat */
  dedupeKey?: string;
  organizationId?: string | null;
  tx?: Tx;
}

export type JobHandler = (payload: any, job: { id: string; attempts: number; type: string }) => Promise<void>;

/** eroare care nu merită reluată (date invalide, resursă ștearsă) */
export class PermanentJobError extends Error {}

export async function enqueue(type: string, payload: Record<string, unknown> = {}, opts: EnqueueOptions = {}): Promise<string | null> {
  const runner = opts.tx ?? db;
  const rows = await runner.insert(jobs).values({
    type,
    payload,
    runAt: opts.runAt ?? new Date(),
    maxAttempts: opts.maxAttempts ?? 5,
    dedupeKey: opts.dedupeKey ?? null,
    organizationId: opts.organizationId ?? null,
  }).onConflictDoNothing({ target: jobs.dedupeKey }).returning({ id: jobs.id });
  return rows[0]?.id ?? null;
}

/** întârzierea până la reîncercarea n (1-based): 30 s, 2 min, 8 min, 32 min, ... plafonată la 6 ore */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 4 ** (attempt - 1), 6 * 3600_000);
}

type ClaimedJob = { id: string; type: string; payload: unknown; attempts: number; max_attempts: number; [k: string]: unknown };

async function claim(types: string[]): Promise<ClaimedJob | null> {
  const rows = await db.execute<ClaimedJob>(sql`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
    where id = (
      select id from jobs
      where status = 'pending' and run_at <= now() and type in (${sql.join(types.map((t) => sql`${t}`), sql`, `)})
      order by run_at
      for update skip locked
      limit 1
    )
    returning id, type, payload, attempts, max_attempts`);
  return (rows as unknown as ClaimedJob[])[0] ?? null;
}

/** eliberează joburile rămase blocate de un worker căzut */
export async function releaseStale(): Promise<number> {
  const rows = await db.execute(sql`
    update jobs set status = 'pending', locked_at = null
    where status = 'running' and locked_at < now() - (${STALE_MS} * interval '1 millisecond')
    returning id`);
  return (rows as unknown as unknown[]).length;
}

/** preia și execută un singur job; întoarce false dacă nu era nimic de făcut */
export async function runOnce(handlers: Record<string, JobHandler>): Promise<boolean> {
  const job = await claim(Object.keys(handlers));
  if (!job) return false;
  const started = performance.now();
  await logContext.run({ jobId: job.id, jobType: job.type }, async () => {
    try {
      await handlers[job.type](job.payload, { id: job.id, attempts: job.attempts, type: job.type });
      await db.execute(sql`update jobs set status = 'done', finished_at = now(), locked_at = null, last_error = null where id = ${job.id}`);
      log.info("job terminat", { durationMs: Math.round(performance.now() - started), attempts: job.attempts });
    } catch (e) {
      const permanent = e instanceof PermanentJobError;
      const final = permanent || job.attempts >= job.max_attempts;
      const message = (e as Error)?.message?.slice(0, 2000) ?? String(e);
      if (final) {
        await db.execute(sql`update jobs set status = 'failed', finished_at = now(), locked_at = null, last_error = ${message} where id = ${job.id}`);
        log.error("job eșuat definitiv", { attempts: job.attempts, err: serializeError(e) });
        reportError(e, { jobId: job.id, jobType: job.type });
        const onFail = (handlers[job.type] as JobHandler & { onFinalFailure?: JobHandler }).onFinalFailure;
        await onFail?.(job.payload, { id: job.id, attempts: job.attempts, type: job.type }).catch(() => {});
      } else {
        const runAt = new Date(Date.now() + backoffMs(job.attempts));
        await db.execute(sql`update jobs set status = 'pending', locked_at = null, last_error = ${message}, run_at = ${runAt.toISOString()}::timestamptz where id = ${job.id}`);
        log.warn("job eșuat, se reia", { attempts: job.attempts, retryAt: runAt.toISOString(), err: message });
      }
    }
  });
  return true;
}

/** execută toate joburile scadente (folosit în teste și la pornire) */
export async function drain(handlers: Record<string, JobHandler>, max = 100): Promise<number> {
  let n = 0;
  while (n < max && (await runOnce(handlers))) n++;
  return n;
}

/** curăță joburile terminate mai vechi de 30 de zile */
export async function pruneFinished(): Promise<void> {
  await db.execute(sql`delete from jobs where status in ('done', 'failed') and finished_at < now() - interval '30 days'`);
}
