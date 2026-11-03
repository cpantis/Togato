/** Bucla workerului: preia joburi până la oprire; eliberează joburile blocate și programează cele zilnice. */
import { log, serializeError } from "../lib/logger";
import { handlers, scheduleRecurring } from "./handlers";
import { releaseStale, runOnce } from "./queue";

export function startWorker(opts: { pollMs?: number; concurrency?: number } = {}) {
  const pollMs = opts.pollMs ?? 2000;
  const concurrency = opts.concurrency ?? 2;
  let stopped = false;
  const loops: Promise<void>[] = [];

  const maintenance = async () => {
    try {
      const released = await releaseStale();
      if (released) log.warn("joburi blocate eliberate", { released });
      await scheduleRecurring();
    } catch (e) {
      log.error("întreținerea cozii a eșuat", { err: serializeError(e) });
    }
  };
  void maintenance();
  const timer = setInterval(maintenance, 60_000);
  timer.unref();

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms).unref());
  for (let i = 0; i < concurrency; i++) {
    loops.push((async () => {
      while (!stopped) {
        try {
          if (!(await runOnce(handlers))) await sleep(pollMs);
        } catch (e) {
          log.error("bucla workerului", { err: serializeError(e) });
          await sleep(pollMs * 5);
        }
      }
    })());
  }
  log.info("worker pornit", { concurrency, types: Object.keys(handlers) });

  return async function stop() {
    stopped = true;
    clearInterval(timer);
    await Promise.all(loops);
  };
}
