/** Construcția aplicației Hono — fără efecte la import (folosită de server și de teste). */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { authRoutes } from "./routes/auth";
import { clientRoutes } from "./routes/clients";
import { aiSystemRoutes, createSystemHandler } from "./routes/aiSystems";
import { obligationRoutes } from "./routes/obligations";
import { dashboardRoutes } from "./routes/dashboard";
import { teamRoutes } from "./routes/team";
import { documentRoutes } from "./routes/documents";
import { portalRoutes } from "./routes/portal";
import { clientPortalRoutes } from "./routes/clientPortal";
import { organizationRoutes } from "./routes/organization";
import { legislationRoutes } from "./routes/legislation";
import { lawRoutes } from "./routes/law";
import { snapshotRoutes } from "./routes/snapshots";
import { accountRoutes } from "./routes/account";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimit } from "./middleware/rateLimit";
import type { AppEnv } from "./types/hono";
import { config } from "./config";
import { requestContext } from "./middleware/requestContext";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { RULESET_VERSION } from "@togato/shared";


export function createApp() {
const app = new Hono<AppEnv>();

app.use("*", requestContext);
// API-ul întoarce doar JSON / fișiere: nimic nu are voie să ruleze sau să fie încadrat
app.use("*", secureHeaders({
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  strictTransportSecurity: "max-age=63072000; includeSubDomains",
  referrerPolicy: "no-referrer",
  crossOriginResourcePolicy: "same-origin",
  xFrameOptions: "DENY",
}));

// viu: procesul răspunde (fără dependențe) — folosit de platformă pentru repornire
app.get("/health", (c) => c.json({ status: "ok", service: "togato-api" }));
// pregătit: baza de date răspunde — folosit pentru rutarea traficului
app.get("/health/ready", async (c) => {
  const started = performance.now();
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
    return c.json({ status: "ok", db: "ok", dbLatencyMs: Math.round(performance.now() - started), rulesetVersion: RULESET_VERSION, release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || null });
  } catch {
    return c.json({ status: "degraded", db: "unavailable" }, 503);
  }
});
app.use("/api/*", cors({
  origin: config().FRONTEND_URL.split(",").map((s) => s.trim()),
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-Id"],
  exposeHeaders: ["X-Request-Id", "Content-Disposition", "X-Togato-Integrity", "Retry-After"],
}));
app.use("/api/*", bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: "Cererea e prea mare" }, 413) }));

app.use("/api/auth/signup", rateLimit({ windowMs: 60_000, max: 5, key: "signup" }));
app.use("/api/auth/login", rateLimit({ windowMs: 60_000, max: 10, key: "login" }));
app.use("/api/auth/login/mfa", rateLimit({ windowMs: 60_000, max: 10, key: "login-mfa" }));
app.use("/api/auth/invitation/*", rateLimit({ windowMs: 60_000, max: 20, key: "invitation" }));
app.use("/api/auth/accept-invitation", rateLimit({ windowMs: 60_000, max: 5, key: "accept" }));
app.use("/api/auth/password/forgot", rateLimit({ windowMs: 15 * 60_000, max: 5, key: "forgot" }));
app.use("/api/auth/password/reset", rateLimit({ windowMs: 15 * 60_000, max: 10, key: "reset" }));
app.route("/api/auth", authRoutes);

// Portalul public al clientului (fără cont, autentificat prin tokenul din link)
app.use("/api/portal/*", rateLimit({ windowMs: 60_000, max: 60, key: "portal" }));
app.on("POST", "/api/portal/*", rateLimit({ windowMs: 60_000, max: 10, key: "portal-write" }));
app.route("/api/portal", portalRoutes);

app.use("/api/*", authMiddleware);
app.use("/api/clients/lookup", rateLimit({ windowMs: 60_000, max: 20, key: "lookup" }));
app.use("/api/ai-systems/*/memo", rateLimit({ windowMs: 60_000, max: 6, key: "memo" }));

app.use("/api/clients/*/documents/*", rateLimit({ windowMs: 60_000, max: 30, key: "docs" }));
app.route("/api/clients", createSystemHandler);
app.route("/api/clients", documentRoutes);
app.route("/api/clients", clientPortalRoutes);
app.route("/api/clients", clientRoutes);
app.route("/api/ai-systems", aiSystemRoutes);
app.route("/api/obligations", obligationRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/team", teamRoutes);
app.route("/api/organization", organizationRoutes);
app.route("/api/legislation", legislationRoutes);
app.route("/api/law", lawRoutes);
app.route("/api/snapshots", snapshotRoutes);
app.use("/api/account/2fa/*", rateLimit({ windowMs: 60_000, max: 15, key: "2fa" }));
app.use("/api/account/password", rateLimit({ windowMs: 15 * 60_000, max: 10, key: "password" }));
app.route("/api/account", accountRoutes);

app.notFound((c) => c.json({ error: "Ruta nu există" }, 404));
app.onError(errorHandler);

return app;
}

export const app = createApp();
