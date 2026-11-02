import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/hono";
import { loadLaw, lookup } from "../services/law";

export const lawRoutes = new Hono<AppEnv>();

/** GET /api/law?ref=Art. 26(7) — textul oficial pentru o trimitere */
lawRoutes.get("/", (c) => {
  const ref = z.string().trim().min(2).max(200).parse(c.req.query("ref"));
  return c.json(lookup(ref));
});

/** GET /api/law/source — informații despre versiunea textului importat */
lawRoutes.get("/source", (c) => c.json(loadLaw().source));
