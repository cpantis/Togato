import { Hono } from "hono";
import { and, eq, ne, sql } from "drizzle-orm";
import type { DashboardData } from "@togato/shared";
import { AI_ACT_DATES } from "@togato/shared";
import { db } from "../db";
import { aiSystems, clients, obligations } from "../db/schema";
import type { AppEnv } from "../types/hono";

export const dashboardRoutes = new Hono<AppEnv>();

const MILESTONES: { date: string; label: string }[] = [
  { date: AI_ACT_DATES.transparency, label: "Transparență (Art. 50)" },
  { date: AI_ACT_DATES.highRiskAnnexIII, label: "Risc ridicat — Anexa III" },
  { date: AI_ACT_DATES.highRiskAnnexI, label: "Risc ridicat — Anexa I" },
];

dashboardRoutes.get("/", async (c) => {
  const { organizationId } = c.get("auth");

  const [{ clientsCount }] = await db.select({ clientsCount: sql<number>`count(*)::int` }).from(clients).where(eq(clients.organizationId, organizationId));
  const risk = await db.select({ riskLevel: aiSystems.riskLevel, n: sql<number>`count(*)::int` })
    .from(aiSystems).where(eq(aiSystems.organizationId, organizationId)).groupBy(aiSystems.riskLevel);
  const [{ pending }] = await db.select({ pending: sql<number>`count(*)::int` }).from(aiSystems)
    .where(and(eq(aiSystems.organizationId, organizationId), ne(aiSystems.reviewStatus, "aprobat")));
  const obl = await db.select({ appliesFrom: obligations.appliesFrom, status: obligations.status, n: sql<number>`count(*)::int` })
    .from(obligations).where(eq(obligations.organizationId, organizationId)).groupBy(obligations.appliesFrom, obligations.status);

  // Sisteme care cer atenție: interzise, cu risc ridicat neaprobate, respinse la verificare
  const attentionRows = await db.select({
    clientId: clients.id, clientName: clients.name, systemId: aiSystems.id, systemName: aiSystems.name,
    riskLevel: aiSystems.riskLevel, reviewStatus: aiSystems.reviewStatus, source: aiSystems.source,
  }).from(aiSystems).innerJoin(clients, eq(clients.id, aiSystems.clientId))
    .where(and(eq(aiSystems.organizationId, organizationId), sql`(${aiSystems.riskLevel} = 'interzis' or ${aiSystems.reviewStatus} <> 'aprobat')`))
    .orderBy(sql`case ${aiSystems.riskLevel} when 'interzis' then 0 when 'risc_ridicat' then 1 when 'transparenta' then 2 else 3 end`, aiSystems.updatedAt)
    .limit(12);

  const open = (r: { status: string }) => r.status === "de_facut" || r.status === "in_lucru";
  const today = new Date().toISOString().slice(0, 10);

  const data: DashboardData = {
    clients: clientsCount,
    systems: risk.reduce((s, r) => s + r.n, 0),
    riskCounts: Object.fromEntries(risk.map((r) => [r.riskLevel, r.n])),
    pendingReview: pending,
    obligationsOpen: obl.filter(open).reduce((s, r) => s + r.n, 0),
    obligationsDone: obl.filter((r) => r.status === "indeplinit").reduce((s, r) => s + r.n, 0),
    attention: attentionRows.map((r) => ({
      clientId: r.clientId, clientName: r.clientName, systemId: r.systemId, systemName: r.systemName, riskLevel: r.riskLevel,
      reason: r.riskLevel === "interzis" ? "Practică interzisă — utilizarea trebuie oprită"
        : r.reviewStatus === "respins" ? "Încadrare respinsă — de reanalizat"
        : r.source === "portal" ? "Adăugat de client prin portal — de verificat"
        : "Încadrare propusă, neverificată de avocat",
    })),
    upcoming: MILESTONES.map((m) => ({
      ...m,
      obligationsOpen: obl.filter((r) => r.appliesFrom === m.date && open(r)).reduce((s, r) => s + r.n, 0),
    })).filter((m) => m.date >= today || m.obligationsOpen > 0),
  };
  return c.json(data);
});
