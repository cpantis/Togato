import { serve } from "@hono/node-server";
import { config } from "./config";
import { log, serializeError } from "./lib/logger";
import { reportError } from "./lib/errorReporting";

// configurarea se validează înainte de orice altceva
let cfg;
try {
  cfg = config();
} catch (e) {
  log.error("configurare invalidă", { err: (e as Error).message });
  process.exit(1);
}

process.on("unhandledRejection", (reason) => {
  log.error("promisiune respinsă netratată", { err: serializeError(reason) });
  reportError(reason, { kind: "unhandledRejection" });
});

// importurile care ating baza de date vin după validarea configurării
Promise.all([import("./app"), import("./jobs/handlers"), import("./jobs/worker"), import("./db")]).then(([{ app }, { scheduleReclassification }, { startWorker }, { closeDb }]) => {
  let stopWorker: (() => Promise<void>) | null = null;
  const server = serve({ fetch: app.fetch, port: cfg!.PORT }, () => {
    log.info("Togato API pornit", { port: cfg!.PORT, env: cfg!.NODE_ENV, worker: cfg!.RUN_WORKER_IN_API });
    // Reîncadrează (o dată per versiune) sistemele salvate pe o versiune mai veche a regulilor AI Act
    scheduleReclassification().catch((e) => { log.error("programarea reîncadrării a eșuat", { err: serializeError(e) }); reportError(e, { kind: "reclassify" }); });
    if (cfg!.RUN_WORKER_IN_API) stopWorker = startWorker();
  });

  // oprire curată: nu mai acceptă cereri noi, le termină pe cele în curs, închide baza de date
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("oprire", { signal });
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(() => Promise.resolve(stopWorker?.()).then(() => closeDb()).finally(() => process.exit(0)));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
