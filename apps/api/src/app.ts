/** Construcția aplicației Hono — fără efecte la import (folosită de server și de teste). */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
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


export function createApp() {
const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ status: "ok", service: "togato-api" }));

if (config().NODE_ENV !== "test") app.use("*", logger());
app.use("/api/*", cors({
  origin: config().FRONTEND_URL.split(",").map((s) => s.trim()),
  credentials: true,
}));
app.use("/api/*", bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: "Cererea e prea mare" }, 413) }));

app.use("/api/auth/signup", rateLimit({ windowMs: 60_000, max: 5, key: "signup" }));
app.use("/api/auth/login", rateLimit({ windowMs: 60_000, max: 10, key: "login" }));
app.use("/api/auth/login/mfa", rateLimit({ windowMs: 60_000, max: 10, key: "login-mfa" }));
app.use("/api/auth/invitation/*", rateLimit({ windowMs: 60_000, max: 20, key: "invitation" }));
app.use("/api/auth/accept-invitation", rateLimit({ windowMs: 60_000, max: 5, key: "accept" }));
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
app.route("/api/account", accountRoutes);

app.notFound((c) => c.json({ error: "Ruta nu există" }, 404));
app.onError(errorHandler);

return app;
}

export const app = createApp();
