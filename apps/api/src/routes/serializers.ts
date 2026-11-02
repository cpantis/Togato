import { normalizeAnswers, normalizePortalAnswers } from "@togato/shared";
import type { aiSystems, obligations } from "../db/schema";

type SystemRow = typeof aiSystems.$inferSelect & { reviewer?: { name: string } | null; overrider?: { name: string } | null };

export function serializeSystem(s: SystemRow) {
  return {
    id: s.id,
    clientId: s.clientId,
    name: s.name,
    vendor: s.vendor,
    description: s.description,
    purpose: s.purpose,
    department: s.department,
    answers: normalizeAnswers(s.answers),
    riskLevel: s.riskLevel,
    classification: s.classification,
    reviewStatus: s.reviewStatus,
    reviewNote: s.reviewNote,
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    reviewedByName: s.reviewer?.name ?? null,
    aiMemo: s.aiMemo,
    aiMemoAt: s.aiMemoAt?.toISOString() ?? null,
    computedRiskLevel: s.classification?.riskLevel ?? null,
    riskOverride: s.riskOverride,
    overrideReason: s.overrideReason,
    overrideByName: s.overrider?.name ?? null,
    overrideAt: s.overrideAt?.toISOString() ?? null,
    rulesetVersion: s.rulesetVersion,
    reclassNote: s.reclassNote,
    reclassifiedAt: s.reclassifiedAt?.toISOString() ?? null,
    source: s.source,
    portalAnswers: s.source === "portal" ? normalizePortalAnswers(s.portalAnswers as any) : null,
    submittedByName: s.submittedByName,
    submittedByEmail: s.submittedByEmail,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function serializeObligation(o: typeof obligations.$inferSelect) {
  return {
    id: o.id,
    clientId: o.clientId,
    aiSystemId: o.aiSystemId,
    code: o.code,
    article: o.article,
    title: o.title,
    description: o.description,
    appliesFrom: o.appliesFrom,
    recommended: o.recommended,
    status: o.status,
    note: o.note,
    dueDate: o.dueDate,
    completedAt: o.completedAt?.toISOString() ?? null,
  };
}
