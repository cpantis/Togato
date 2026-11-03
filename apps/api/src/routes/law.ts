import { Hono } from "hono";
import { createHash } from "crypto";
import { z } from "zod";
import type { AppEnv } from "../types/hono";
import { loadLaw, lookup } from "../services/law";

export const lawRoutes = new Hono<AppEnv>();

/** GET /api/law?ref=Art. 26(7) — textul oficial pentru o trimitere */
lawRoutes.get("/", (c) => {
  const ref = z.string().trim().min(2).max(200).parse(c.req.query("ref"));
  // textul legii se schimbă doar odată cu o versiune nouă a aplicației: browserul îl poate păstra o zi
  // antetele HTTP acceptă doar ASCII: versiunea (cu diacritice) și trimiterea intră într-un hash
  const etag = `W/"law-${createHash("sha256").update(`${loadLaw().source.version}|${ref}`).digest("base64url").slice(0, 24)}"`;
  if (c.req.header("if-none-match") === etag) return c.body(null, 304);
  c.header("ETag", etag);
  c.header("Cache-Control", "private, max-age=86400");
  return c.json(lookup(ref));
});

/** GET /api/law/source — informații despre versiunea textului importat */
lawRoutes.get("/source", (c) => c.json(loadLaw().source));
