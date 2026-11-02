import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

export const errorHandler = (err: Error, c: Context) => {
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof ZodError) {
    return c.json({ error: "Date invalide", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }
  if (err instanceof SyntaxError && /JSON/.test(err.message)) {
    return c.json({ error: "Corpul cererii nu e JSON valid" }, 400);
  }
  console.error(`[${c.req.method} ${c.req.path}]`, err);
  return c.json({ error: "Eroare internă. Reîncearcă sau contactează suportul." }, 500);
};
