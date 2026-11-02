/**
 * Reîncadrarea sistemelor salvate pe o versiune mai veche a regulilor AI Act.
 * Rulează la pornirea API-ului (după o actualizare legislativă publicată în cod).
 * Un lacăt Postgres (advisory lock) împiedică două instanțe să ruleze în paralel.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { RULESET_VERSION, normalizeAnswers, planReclassification } from "@togato/shared";
import { db } from "../db";
import { aiSystems, auditLog } from "../db/schema";
import { syncClientObligations, syncSystemObligations } from "./obligationsSync";

const LOCK_KEY = 74_201_901; // cheie arbitrară, unică pentru acest job
const BATCH = 200;

export interface ReclassifyReport {
  processed: number;
  needsReview: number;
  minorUpdates: number;
  skipped: boolean;
}

export async function reclassifyOutdated(): Promise<ReclassifyReport> {
  const report: ReclassifyReport = { processed: 0, needsReview: 0, minorUpdates: 0, skipped: false };
  return db.transaction(async (lockTx) => {
    const [{ locked }] = await lockTx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`);
    if (!locked) {
      report.skipped = true;
      return report;
    }
    const touchedClients = new Map<string, string>(); // clientId -> organizationId
    for (;;) {
      const batch = await db.select().from(aiSystems).where(ne(aiSystems.rulesetVersion, RULESET_VERSION)).limit(BATCH);
      if (!batch.length) break;
      for (const s of batch) {
        const plan = planReclassification({
          answers: normalizeAnswers(s.answers),
          stored: s.classification,
          riskOverride: s.riskOverride === "neclasificat" ? null : s.riskOverride,
          fromVersion: s.rulesetVersion,
        });
        await db.transaction(async (tx) => {
          await tx.update(aiSystems).set({
            classification: plan.classification,
            riskLevel: plan.riskLevel,
            rulesetVersion: RULESET_VERSION,
            ...(plan.needsReview
              ? { reviewStatus: "propus" as const, reviewedAt: null, reviewedBy: null, reclassNote: plan.note, reclassifiedAt: new Date() }
              : {}),
          }).where(eq(aiSystems.id, s.id));
          await syncSystemObligations(tx, { organizationId: s.organizationId, clientId: s.clientId, aiSystemId: s.id, templates: plan.classification.obligations });
          if (!plan.diff.identical) {
            await tx.insert(auditLog).values({
              organizationId: s.organizationId, userId: null, action: "reclassify", entity: "ai_system", entityId: s.id,
              details: { fromVersion: s.rulesetVersion, toVersion: RULESET_VERSION, needsReview: plan.needsReview, note: plan.note },
            });
          }
        });
        touchedClients.set(s.clientId, s.organizationId);
        report.processed++;
        if (plan.needsReview) report.needsReview++;
        else if (!plan.diff.identical) report.minorUpdates++;
      }
    }
    // obligațiile generale ale clienților pot fi și ele afectate de catalog
    for (const [clientId, organizationId] of touchedClients) {
      await db.transaction((tx) => syncClientObligations(tx, organizationId, clientId));
    }
    return report;
  });
}

/** Clienții care au sisteme cu notă de reîncadrare neverificată */
export async function pendingLawUpdates(organizationId: string) {
  return db.query.aiSystems.findMany({
    where: and(eq(aiSystems.organizationId, organizationId), sql`${aiSystems.reclassNote} is not null`),
    with: { client: { columns: { id: true, name: true } } },
    columns: { id: true, name: true, reclassNote: true, reclassifiedAt: true, riskLevel: true },
    orderBy: (t, { desc }) => [desc(t.reclassifiedAt)],
  });
}

