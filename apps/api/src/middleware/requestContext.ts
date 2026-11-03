/** Id unic per cerere (antet X-Request-Id), context pentru jurnal și o linie de acces la final. */
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import crypto from "crypto";
import { log, logContext } from "../lib/logger";

const VALID_ID = /^[A-Za-z0-9._-]{8,64}$/;

export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const requestId = incoming && VALID_ID.test(incoming) ? incoming : crypto.randomUUID();
  const store: Record<string, unknown> = { requestId };
  c.set("requestId", requestId);
  const started = performance.now();
  await logContext.run(store, async () => {
    await next();
    c.header("X-Request-Id", requestId);
    const auth = c.get("auth") as { organizationId?: string; userId?: string } | undefined;
    if (auth) Object.assign(store, { organizationId: auth.organizationId, userId: auth.userId });
    if (c.req.path === "/health" || c.req.path.startsWith("/health/")) return;
    const status = c.res.status;
    log[status >= 500 ? "error" : status >= 400 ? "warn" : "info"]("request", {
      method: c.req.method,
      // calea, fără query string (tokenuri de portal pot apărea în cale — se trunchiază)
      path: c.req.path.replace(/\/portal\/[^/]+/, "/portal/[token]").replace(/\/invitation\/[^/]+/, "/invitation/[token]"),
      status,
      durationMs: Math.round(performance.now() - started),
    });
  });
};
