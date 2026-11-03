import { serve } from "@hono/node-server";
import { config } from "./config";

// configurarea se validează înainte de orice altceva
let cfg;
try {
  cfg = config();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

process.on("unhandledRejection", (reason) => console.error("[process] Unhandled rejection:", reason));

// importurile care ating baza de date vin după validarea configurării
import("./app").then(({ app }) => import("./services/reclassify").then(({ reclassifyOutdated }) => {
  serve({ fetch: app.fetch, port: cfg!.PORT }, () => {
    console.log(`Togato API pornit pe :${cfg!.PORT}`);
    // Reîncadrează sistemele salvate pe o versiune mai veche a regulilor AI Act
    reclassifyOutdated()
      .then((r) => { if (r.processed) console.log(`[legislație] reîncadrate ${r.processed} sisteme (${r.needsReview} de verificat, ${r.minorUpdates} actualizări minore)`); })
      .catch((e) => console.error("[legislație] reîncadrarea a eșuat:", e));
  });
}));
