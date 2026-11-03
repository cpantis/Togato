/**
 * Exportul complet al dosarului unui client (ZIP): date structurate, avizele înghețate (PDF),
 * documentele generate, dovezile și jurnalul de activitate. Pentru predare, arhivare sau audit.
 */
import { zipSync, strToU8 } from "fflate";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { RISK_LABELS, OBLIGATION_STATUS_LABELS, REVIEW_STATUS_LABELS, RULESET_VERSION } from "@togato/shared";
import { db } from "../db";
import { aiSystems, analysisSnapshots, auditLog, breaches, clients, dsarRequests, evidence, obligations, processingActivities, users } from "../db/schema";
import { breachDeadline, checkProcessing } from "@togato/shared";
import { renderGdprDocument, ropaBlocks } from "./documents/gdprTemplates";
import { storage } from "./storage";
import { renderSnapshotPdf, verifySnapshot } from "./snapshots";
import { loadDocContext, slug } from "./documents/common";
import { listDocuments, renderDocument } from "./documents";

/** un câmp CSV, cu ghilimele când e nevoie; prefixat dacă ar putea fi interpretat ca formulă în Excel */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM: Excel deschide corect diacriticele
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** nume unic într-un director al arhivei */
function uniqueName(used: Set<string>, dir: string, name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = `${dir}/${name}`;
  for (let i = 2; used.has(candidate); i++) candidate = `${dir}/${stem} (${i})${ext}`;
  used.add(candidate);
  return candidate;
}

export async function buildDossierZip(organizationId: string, clientId: string, preparedBy: string): Promise<{ zip: Uint8Array; filename: string } | null> {
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)) });
  if (!client) return null;
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const now = new Date();

  const systems = await db.select().from(aiSystems).where(and(eq(aiSystems.clientId, clientId), eq(aiSystems.organizationId, organizationId))).orderBy(asc(aiSystems.name));
  const obls = await db.select().from(obligations).where(and(eq(obligations.clientId, clientId), eq(obligations.organizationId, organizationId))).orderBy(asc(obligations.appliesFrom), asc(obligations.code));
  const snaps = await db.select().from(analysisSnapshots).where(and(eq(analysisSnapshots.clientId, clientId), eq(analysisSnapshots.organizationId, organizationId))).orderBy(asc(analysisSnapshots.createdAt));
  const ev = await db.select().from(evidence).where(and(eq(evidence.clientId, clientId), eq(evidence.organizationId, organizationId))).orderBy(asc(evidence.createdAt));
  const sysName = new Map(systems.map((s) => [s.id, s.name]));
  const oblById = new Map(obls.map((o) => [o.id, o]));

  // avizele înghețate, cu verificarea amprentei
  const snapIndex = [];
  for (const s of snaps) {
    const intact = verifySnapshot(s);
    const pdf = await renderSnapshotPdf(s, { intact });
    const path = uniqueName(used, "avize", `${slug(sysName.get(s.aiSystemId ?? "") ?? "sistem")}_v${s.version}_${s.createdAt.toISOString().slice(0, 10)}.pdf`);
    files[path] = new Uint8Array(pdf);
    snapIndex.push({ file: path, system: sysName.get(s.aiSystemId ?? "") ?? null, version: s.version, createdAt: s.createdAt.toISOString(), createdBy: s.createdByName, sha256: s.sha256, integrity: intact ? "ok" : "MODIFICAT" });
  }

  // dovezile
  const evIndex = [];
  for (const e of ev) {
    const o = oblById.get(e.obligationId);
    const path = uniqueName(used, `dovezi/${slug(o?.code ?? "obligatie")}`, e.fileName);
    files[path] = new Uint8Array(await storage().get(e.storageKey));
    evIndex.push({ file: path, obligation: o?.title ?? null, article: o?.article ?? null, sha256: e.sha256, size: e.size, note: e.note, uploadedAt: e.createdAt.toISOString() });
  }

  // documentele generate (la data exportului)
  const ctx = await loadDocContext(organizationId, clientId, preparedBy);
  if (ctx) {
    for (const d of listDocuments(ctx)) {
      if (!d.available) continue;
      const targets = d.perSystem ? d.systems.map((s) => s.id) : [undefined];
      for (const sid of targets) {
        const r = await renderDocument(ctx, d.type, sid);
        if ("buffer" in r) files[uniqueName(used, "documente", r.filename)] = new Uint8Array(r.buffer);
      }
    }
  }

  // GDPR: registrul prelucrărilor (Word + CSV), cererile persoanelor vizate, incidentele
  const acts = await db.select().from(processingActivities).where(and(eq(processingActivities.clientId, clientId), eq(processingActivities.organizationId, organizationId))).orderBy(asc(processingActivities.name));
  const dsars = await db.select().from(dsarRequests).where(and(eq(dsarRequests.clientId, clientId), eq(dsarRequests.organizationId, organizationId))).orderBy(asc(dsarRequests.receivedOn));
  const brs = await db.select().from(breaches).where(and(eq(breaches.clientId, clientId), eq(breaches.organizationId, organizationId))).orderBy(asc(breaches.discoveredAt));
  if (ctx && acts.length) {
    const doc = await renderGdprDocument(ctx, "Registrul activităților de prelucrare", ropaBlocks(ctx, acts, sysName));
    files[uniqueName(used, "gdpr", doc.filename)] = new Uint8Array(doc.buffer);
  }
  if (acts.length) files["gdpr/registru_prelucrari.csv"] = strToU8(toCsv(["activitate", "scop", "calitate", "temei legal", "categorii de date", "persoane vizate", "destinatari", "transfer in afara SEE", "pastrare", "DPIA probabila"],
    acts.map((a) => [a.name, a.purpose, a.role, a.legalBases.join(" "), a.dataCategories.join(" "), a.subjectCategories.join(" "), a.recipients, a.transferOutsideEea ? `${a.transferCountries ?? ""} (${a.transferMechanism ?? "fara mecanism"})` : "nu", a.retention, checkProcessing({ ...a, usesAi: a.aiSystemIds.length > 0 }).dpiaLikely ? "da" : "nu"])));
  if (dsars.length) files["gdpr/cereri_persoane_vizate.csv"] = strToU8(toCsv(["tip", "solicitant", "primita", "termen", "prelungita", "identitate verificata", "stare", "inchisa", "raspuns"],
    dsars.map((d) => [d.type, d.requesterName, d.receivedOn, d.dueOn, d.extended ? `da: ${d.extensionReason ?? ""}` : "nu", d.identityVerified ? "da" : "nu", d.status, d.closedOn, d.outcome])));
  if (brs.length) files["gdpr/incidente_securitate.csv"] = strToU8(toCsv(["incident", "descoperit", "termen 72h", "risc", "persoane afectate", "ANSPDCP notificata", "nr. inregistrare", "persoane informate", "inchis", "masuri"],
    brs.map((b) => [b.title, b.discoveredAt.toISOString(), breachDeadline(b.discoveredAt).toISOString(), b.risk, b.subjectsAffected, b.authorityNotifiedAt?.toISOString() ?? "", b.authorityReference, b.subjectsNotifiedAt?.toISOString() ?? "", b.closedAt?.toISOString() ?? "", b.measures])));

  // jurnalul de activitate pentru client și entitățile lui
  const entityIds = [clientId, ...systems.map((s) => s.id), ...obls.map((o) => o.id), ...snaps.map((s) => s.id), ...ev.map((e) => e.id), ...acts.map((a) => a.id), ...dsars.map((d) => d.id), ...brs.map((b) => b.id)];
  const logRows = await db.select({ at: auditLog.createdAt, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, details: auditLog.details, user: users.name })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
    .where(and(eq(auditLog.organizationId, organizationId), or(inArray(auditLog.entityId, entityIds))))
    .orderBy(asc(auditLog.createdAt));
  files["jurnal_activitate.csv"] = strToU8(toCsv(["data", "utilizator", "actiune", "entitate", "id", "detalii"],
    logRows.map((r) => [r.at.toISOString(), r.user ?? "portal / sistem", r.action, r.entity, r.entityId, r.details ? JSON.stringify(r.details) : ""])));

  files["obligatii.csv"] = strToU8(toCsv(["sistem", "cod", "articol", "obligatie", "se aplica din", "stare", "termen intern", "indeplinita la", "nota"],
    obls.map((o) => [o.aiSystemId ? sysName.get(o.aiSystemId) : "(general, client)", o.code, o.article, o.title, o.appliesFrom, OBLIGATION_STATUS_LABELS[o.status], o.dueDate, o.completedAt?.toISOString() ?? "", o.note])));

  files["sisteme_ai.csv"] = strToU8(toCsv(["sistem", "furnizor", "departament", "nivel de risc", "verificare", "incadrare manuala", "sursa", "versiune reguli"],
    systems.map((s) => [s.name, s.vendor, s.department, RISK_LABELS[s.riskLevel], REVIEW_STATUS_LABELS[s.reviewStatus], s.riskOverride ? `${RISK_LABELS[s.riskOverride]} — ${s.overrideReason ?? ""}` : "", s.source, s.rulesetVersion])));

  const dossier = {
    generatedAt: now.toISOString(), generatedBy: preparedBy, rulesetVersion: RULESET_VERSION,
    client: { name: client.name, cui: client.cui, regCom: client.regCom, address: client.address, city: client.city, county: client.county, caen: client.caen, caenDescription: client.caenDescription, archivedAt: client.archivedAt?.toISOString() ?? null },
    systems: systems.map((s) => ({ id: s.id, name: s.name, vendor: s.vendor, description: s.description, purpose: s.purpose, department: s.department, answers: s.answers, riskLevel: s.riskLevel, classification: s.classification, reviewStatus: s.reviewStatus, reviewNote: s.reviewNote, riskOverride: s.riskOverride, overrideReason: s.overrideReason, source: s.source, portalAnswers: s.portalAnswers, aiMemo: s.aiMemo, aiMemoCitations: s.aiMemoCitations })),
    obligations: obls.map((o) => ({ id: o.id, system: o.aiSystemId ? sysName.get(o.aiSystemId) : null, code: o.code, article: o.article, title: o.title, appliesFrom: o.appliesFrom, status: o.status, dueDate: o.dueDate, note: o.note })),
    snapshots: snapIndex,
    evidence: evIndex,
  };
  files["dosar.json"] = strToU8(JSON.stringify(dossier, null, 2));
  files["CITESTE-MA.txt"] = strToU8([
    `Dosar AI Act — ${client.name}`,
    `Exportat la ${now.toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })} de ${preparedBy}, din Togato (reguli ${RULESET_VERSION}).`,
    "",
    "avize/              avizele aprobate, înghețate (PDF), cu amprenta SHA-256 verificată la export",
    "documente/          documentele generate la data exportului (Word)",
    "dovezi/             fișierele atașate obligațiilor, pe coduri de obligație",
    "obligatii.csv       obligațiile, starea, termenele și notele",
    "sisteme_ai.csv      inventarul sistemelor AI și încadrarea",
    "gdpr/               registrul prelucrărilor (Word, CSV), cererile persoanelor vizate, incidentele de securitate",
    "jurnal_activitate.csv  cine a făcut ce și când",
    "dosar.json          toate datele de mai sus, structurat (inclusiv răspunsurile la chestionar)",
    "",
    `Avize: ${snapIndex.length} (${snapIndex.filter((s) => s.integrity !== "ok").length} cu amprenta modificată). Dovezi: ${evIndex.length}.`,
  ].join("\r\n"));

  const zip = zipSync(files, { level: 6, mtime: now });
  return { zip, filename: `Dosar_AI_Act_${slug(client.name)}_${now.toISOString().slice(0, 10)}.zip` };
}
