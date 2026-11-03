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
Promise.all([import("./app"), import("./services/reclassify"), import("./db")]).then(([{ app }, { reclassifyOutdated }, { closeDb }]) => {
  const server = serve({ fetch: app.fetch, port: cfg!.PORT }, () => {
    log.info("Togato API pornit", { port: cfg!.PORT, env: cfg!.NODE_ENV });
    // Reîncadrează sistemele salvate pe o versiune mai veche a regulilor AI Act
    reclassifyOutdated()
      .then((r) => { if (r.processed) log.info("reîncadrare după schimbarea regulilor", { ...r }); })
      .catch((e) => { log.error("reîncadrarea a eșuat", { err: serializeError(e) }); reportError(e, { kind: "reclassify" }); });
  });

  // oprire curată: nu mai acceptă cereri noi, le termină pe cele în curs, închide baza de date
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("oprire", { signal });
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(() => closeDb().finally(() => process.exit(0)));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
