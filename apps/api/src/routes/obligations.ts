import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { obligations } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { notFound, uuidParam } from "../lib/http";
import { serializeObligation } from "./serializers";

export const obligationRoutes = new Hono<AppEnv>();

const updateSchema = z.object({
  status: z.enum(["de_facut", "in_lucru", "indeplinit", "nu_se_aplica"]).optional(),
  note: z.string().trim().max(5000).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data trebuie să fie în formatul AAAA-LL-ZZ").nullish(),
});

obligationRoutes.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const id = uuidParam(c.req.param("id"));
  const existing = await db.query.obligations.findFirst({ where: and(eq(obligations.id, id), eq(obligations.organizationId, auth.organizationId)) });
  if (!existing) notFound("Obligația nu a fost găsită");

  const body = updateSchema.parse(await c.req.json());
  const patch: Partial<typeof obligations.$inferInsert> = { updatedAt: new Date(), updatedBy: auth.userId };
  if (body.status !== undefined) {
    patch.status = body.status;
    patch.completedAt = body.status === "indeplinit" ? (existing.completedAt ?? new Date()) : null;
  }
  if (body.note !== undefined) patch.note = body.note || null;
  if (body.dueDate !== undefined) patch.dueDate = body.dueDate || null;

  const [row] = await db.update(obligations).set(patch)
    .where(and(eq(obligations.id, id), eq(obligations.organizationId, auth.organizationId))).returning();
  if (body.status !== undefined && body.status !== existing.status) {
    await audit(auth, "status", "obligation", id, { code: existing.code, from: existing.status, to: body.status });
  }
  return c.json(serializeObligation(row));
});
