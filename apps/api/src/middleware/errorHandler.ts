import type { Context } from "hono";
import type { AppEnv } from "../types/hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { log, serializeError } from "../lib/logger";
import { reportError } from "../lib/errorReporting";

export const errorHandler = (err: Error, c: Context<AppEnv>) => {
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof ZodError) {
    return c.json({ error: "Date invalide", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }
  if (err instanceof SyntaxError && /JSON/.test(err.message)) {
    return c.json({ error: "Corpul cererii nu e JSON valid" }, 400);
  }
  log.error("eroare neprevăzută", { method: c.req.method, path: c.req.path, err: serializeError(err) });
  reportError(err, { method: c.req.method, path: c.req.path });
  const requestId = c.get("requestId") as string | undefined;
  return c.json({ error: "Eroare internă. Reîncearcă sau contactează suportul.", requestId }, 500);
};
