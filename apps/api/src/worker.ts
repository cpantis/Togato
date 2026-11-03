/** Proces separat pentru joburi (`npm run worker`). Se poate scala independent de API. */
import { config } from "./config";
import { log, serializeError } from "./lib/logger";
import { reportError } from "./lib/errorReporting";

try {
  config();
} catch (e) {
  log.error("configurare invalidă", { err: (e as Error).message });
  process.exit(1);
}
process.on("unhandledRejection", (reason) => {
  log.error("promisiune respinsă netratată", { err: serializeError(reason) });
  reportError(reason, { kind: "unhandledRejection", process: "worker" });
});

Promise.all([import("./jobs/worker"), import("./jobs/handlers"), import("./db")]).then(async ([{ startWorker }, { scheduleReclassification }, { closeDb }]) => {
  await scheduleReclassification();
  const stop = startWorker({ concurrency: Number(process.env.WORKER_CONCURRENCY || 4) });
  const shutdown = async (signal: string) => {
    log.info("worker: oprire", { signal });
    setTimeout(() => process.exit(1), 30_000).unref();
    await stop();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
});
