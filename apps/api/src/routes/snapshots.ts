import { log } from "../lib/logger";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { analysisSnapshots } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { notFound, uuidParam } from "../lib/http";
import { renderSnapshotPdf, verifySnapshot, type SnapshotData } from "../services/snapshots";
import { slug } from "../services/documents/common";

export const snapshotRoutes = new Hono<AppEnv>();

/** GET /:id/pdf — avizul înghețat, ca PDF datat */
snapshotRoutes.get("/:id/pdf", async (c) => {
  const auth = c.get("auth");
  const id = uuidParam(c.req.param("id"));
  const row = await db.query.analysisSnapshots.findFirst({ where: and(eq(analysisSnapshots.id, id), eq(analysisSnapshots.organizationId, auth.organizationId)) });
  if (!row) notFound("Avizul nu a fost găsit");
  const intact = verifySnapshot(row);
  if (!intact) log.error("amprenta avizului nu corespunde", { snapshotId: row.id });
  const pdf = await renderSnapshotPdf(row, { intact });
  const data = row.data as SnapshotData;
  const filename = `Aviz_AI_Act_${slug(data.client.name)}_${slug(data.system.name)}_v${row.version}_${row.createdAt.toISOString().slice(0, 10)}.pdf`;
  await audit(auth, "export", "snapshot", row.id, { version: row.version, intact });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Togato-Integrity": intact ? "ok" : "modified",
      "Cache-Control": "no-store",
    },
  });
});
