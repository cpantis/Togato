/**
 * Instantaneele analizelor aprobate („avize înghețate”) și exportul lor PDF.
 *
 * La aprobarea unei încadrări (sau la o încadrare manuală) se salvează tot ce a stat la baza avizului:
 * răspunsurile, încadrarea, obligațiile cu stările lor, memoriul AI, versiunea regulilor și a textului legii.
 * O amprentă SHA-256 peste conținutul canonic permite dovedirea faptului că instantaneul n-a fost modificat.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  ANNEX_III_USES, LEGAL_ROLE_LABELS, OBLIGATION_STATUS_LABELS, PROHIBITED_PRACTICES, QUALIFICATION_OPTIONS, RISK_LABELS,
  ROLE_OPTIONS, RULESET_VERSION, SCOPE_EXCLUSIONS, TRANSPARENCY_TRIGGERS, normalizeAnswers,
  type AiSystemAnswers, type ClassificationResult, type ObligationStatus, type RiskLevel,
} from "@togato/shared";
import type { Tx } from "../db";
import { aiSystems, analysisSnapshots, clients, obligations, organizations } from "../db/schema";
import { loadLaw } from "./law";

// ─── Conținutul instantaneului ───────────────────────────

export interface SnapshotData {
  cabinet: { name: string };
  client: { name: string; cui: string | null; caen: string | null };
  system: { name: string; vendor: string | null; description: string | null; purpose: string | null; department: string | null; source: string };
  answers: AiSystemAnswers;
  classification: ClassificationResult | null;
  riskLevel: RiskLevel | "neclasificat";
  override: { riskLevel: RiskLevel; reason: string | null } | null;
  review: { status: string; note: string | null; by: string; at: string };
  obligations: { article: string; title: string; appliesFrom: string; status: ObligationStatus; note: string | null; dueDate: string | null }[];
  memo: { text: string; citations: { n: number; ref: string; quote: string }[]; generatedAt: string | null } | null;
}

/** JSON canonic: chei sortate recursiv, ca amprenta să nu depindă de ordinea cheilor. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).filter((k) => obj[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function snapshotHash(meta: { version: number; rulesetVersion: string; lawTextVersion: string; createdAt: string; createdByName: string; reason: string }, data: SnapshotData): string {
  return crypto.createHash("sha256").update(canonicalJson({ meta, data })).digest("hex");
}

export function lawTextVersion(): string {
  const s = loadLaw().source;
  return `${s.celex} — ${s.version}${s.journal ? ` (JO ${s.journal})` : ""}`;
}

/** Creează instantaneul în aceeași tranzacție cu aprobarea. */
export async function createSnapshot(tx: Tx, params: { organizationId: string; aiSystemId: string; userId: string; userName: string; reason: string }) {
  const s = await tx.query.aiSystems.findFirst({ where: and(eq(aiSystems.id, params.aiSystemId), eq(aiSystems.organizationId, params.organizationId)) });
  if (!s) return null;
  const client = await tx.query.clients.findFirst({ where: eq(clients.id, s.clientId) });
  const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, params.organizationId) });
  const obl = await tx.select().from(obligations).where(eq(obligations.aiSystemId, s.id));
  obl.sort((x, y) => x.appliesFrom.localeCompare(y.appliesFrom) || x.article.localeCompare(y.article, "ro", { numeric: true }));
  const [{ last }] = await tx.select({ last: sql<number>`coalesce(max(${analysisSnapshots.version}), 0)::int` }).from(analysisSnapshots).where(eq(analysisSnapshots.aiSystemId, s.id));

  const createdAt = new Date();
  const data: SnapshotData = {
    cabinet: { name: org?.name ?? "" },
    client: { name: client?.name ?? "", cui: client?.cui ?? null, caen: client?.caen ?? null },
    system: { name: s.name, vendor: s.vendor, description: s.description, purpose: s.purpose, department: s.department, source: s.source },
    answers: normalizeAnswers(s.answers),
    classification: s.classification,
    riskLevel: s.riskLevel,
    override: s.riskOverride && s.riskOverride !== "neclasificat" ? { riskLevel: s.riskOverride, reason: s.overrideReason } : null,
    review: { status: s.reviewStatus, note: s.reviewNote, by: params.userName, at: createdAt.toISOString() },
    obligations: obl.map((o) => ({ article: o.article, title: o.title, appliesFrom: o.appliesFrom, status: o.status, note: o.note, dueDate: o.dueDate })),
    memo: s.aiMemo ? { text: s.aiMemo, citations: s.aiMemoCitations ?? [], generatedAt: s.aiMemoAt?.toISOString() ?? null } : null,
  };
  const meta = { version: last + 1, rulesetVersion: RULESET_VERSION, lawTextVersion: lawTextVersion(), createdAt: createdAt.toISOString(), createdByName: params.userName, reason: params.reason };
  const [row] = await tx.insert(analysisSnapshots).values({
    organizationId: params.organizationId,
    clientId: s.clientId,
    aiSystemId: s.id,
    version: meta.version,
    reason: meta.reason,
    rulesetVersion: meta.rulesetVersion,
    lawTextVersion: meta.lawTextVersion,
    data,
    sha256: snapshotHash(meta, data),
    createdBy: params.userId,
    createdByName: params.userName,
    createdAt,
  }).returning();
  return row;
}

export async function listSnapshots(db: Pick<Tx, "select">, organizationId: string, aiSystemId: string) {
  return db.select({
    id: analysisSnapshots.id, version: analysisSnapshots.version, reason: analysisSnapshots.reason,
    rulesetVersion: analysisSnapshots.rulesetVersion, createdAt: analysisSnapshots.createdAt,
    createdByName: analysisSnapshots.createdByName, sha256: analysisSnapshots.sha256,
    riskLevel: sql<string>`${analysisSnapshots.data}->>'riskLevel'`,
  }).from(analysisSnapshots)
    .where(and(eq(analysisSnapshots.aiSystemId, aiSystemId), eq(analysisSnapshots.organizationId, organizationId)))
    .orderBy(desc(analysisSnapshots.version));
}

/** Recalculează amprenta din conținutul salvat — detectează orice modificare ulterioară a rândului. */
export function verifySnapshot(row: typeof analysisSnapshots.$inferSelect): boolean {
  const meta = { version: row.version, rulesetVersion: row.rulesetVersion, lawTextVersion: row.lawTextVersion, createdAt: row.createdAt.toISOString(), createdByName: row.createdByName, reason: row.reason };
  return snapshotHash(meta, row.data as SnapshotData) === row.sha256;
}

// ─── PDF ─────────────────────────────────────────────────

const FONT_DIR_CANDIDATES = [path.resolve(__dirname, "../assets/fonts"), path.resolve(__dirname, "../../src/assets/fonts")];
const BRAND = "#7a1f3a";
const MUTED = "#64748b";
const INK = "#0f172a";

function fontDir(): string {
  const dir = FONT_DIR_CANDIDATES.find((d) => fs.existsSync(path.join(d, "DejaVuSans.ttf")));
  if (!dir) throw new Error("Fonturile pentru PDF lipsesc (src/assets/fonts)");
  return dir;
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
};
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" });
const labelsOf = (codes: string[], list: { code: string; label: string }[]) => codes.map((c) => list.find((o) => o.code === c)?.label ?? c);

export function renderSnapshotPdf(
  row: Pick<typeof analysisSnapshots.$inferSelect, "version" | "reason" | "rulesetVersion" | "lawTextVersion" | "sha256" | "createdAt" | "createdByName" | "data">,
  opts: { intact?: boolean } = {},
): Promise<Buffer> {
  const data = row.data as SnapshotData;
  const dir = fontDir();
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 56, right: 56 }, bufferPages: true, info: {
    Title: `Aviz AI Act — ${data.system.name} — ${data.client.name}`,
    Author: data.cabinet.name,
    Subject: `Instantaneu v${row.version}, ${fmtDate(row.createdAt.toISOString())}`,
    Creator: "Togato",
  } });
  doc.registerFont("R", path.join(dir, "DejaVuSans.ttf"));
  doc.registerFont("B", path.join(dir, "DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const h1 = (t: string) => { doc.moveDown(0.8); doc.font("B").fontSize(13).fillColor(BRAND).text(t); doc.moveDown(0.3); };
  const p = (t: string, opts: { size?: number; color?: string; bold?: boolean } = {}) => doc.font(opts.bold ? "B" : "R").fontSize(opts.size ?? 9.5).fillColor(opts.color ?? INK).text(t, { width, lineGap: 1.5 });
  const kv = (k: string, v: string) => {
    const y = doc.y;
    doc.font("B").fontSize(9).fillColor(MUTED).text(k, doc.page.margins.left, y, { width: 150 });
    const yk = doc.y;
    doc.font("R").fontSize(9.5).fillColor(INK).text(v || "—", doc.page.margins.left + 160, y, { width: width - 160 });
    doc.y = Math.max(yk, doc.y) + 3;
    doc.x = doc.page.margins.left;
  };

  // Antet
  doc.font("B").fontSize(10).fillColor(MUTED).text(data.cabinet.name.toUpperCase(), { characterSpacing: 1 });
  doc.moveDown(0.4);
  doc.font("B").fontSize(20).fillColor(BRAND).text("Aviz de încadrare AI Act");
  doc.font("R").fontSize(12).fillColor("#334155").text(`${data.system.name} — ${data.client.name}`);
  doc.moveDown(0.4);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + width, doc.y).lineWidth(1.5).strokeColor(BRAND).stroke();
  doc.moveDown(0.8);

  kv("Client", `${data.client.name}${data.client.cui ? ` (CUI ${data.client.cui})` : ""}`);
  kv("Sistem AI", `${data.system.name}${data.system.vendor ? ` — ${data.system.vendor}` : ""}`);
  kv("Data avizului", fmtDateTime(row.createdAt.toISOString()));
  kv("Aprobat de", `${row.createdByName} (${row.reason})`);
  kv("Instantaneu", `versiunea ${row.version}`);
  kv("Regulile aplicate", `Togato, versiunea ${row.rulesetVersion}`);
  kv("Textul legii", row.lawTextVersion);

  // Încadrare
  const c = data.classification;
  h1("1. Încadrare");
  p(`Nivel de risc: ${RISK_LABELS[data.riskLevel]}${c ? ` · Rol: ${LEGAL_ROLE_LABELS[c.role]}` : ""}${c?.highRiskBasis ? ` · Temei: ${c.highRiskBasis === "anexa_i" ? "Anexa I" : "Anexa III"}` : ""}`, { bold: true });
  if (data.override) {
    doc.moveDown(0.3);
    p(`Încadrare stabilită manual de avocat: ${RISK_LABELS[data.override.riskLevel]}${c ? ` (încadrarea calculată: ${RISK_LABELS[c.riskLevel]})` : ""}.`);
    if (data.override.reason) p(`Motivare: ${data.override.reason}`, { color: "#334155" });
  }
  if (c) {
    doc.moveDown(0.3);
    for (const r of c.reasons) p(`• ${r.article === "—" ? "" : `${r.article}: `}${r.text}`);
    if (c.warnings.length) {
      doc.moveDown(0.3);
      for (const w of c.warnings) p(`Atenție: ${w}`, { color: "#92400e" });
    }
  }
  if (data.review.note) {
    doc.moveDown(0.3);
    p(`Nota avocatului: ${data.review.note}`, { color: "#334155" });
  }

  // Situația de fapt
  const a = data.answers;
  h1("2. Situația de fapt (răspunsuri la chestionar)");
  if (data.system.description) kv("Descriere", data.system.description);
  if (data.system.purpose) kv("Scop", data.system.purpose);
  if (data.system.department) kv("Utilizatori", data.system.department);
  kv("E sistem de IA (Art. 3 pct. 1)", QUALIFICATION_OPTIONS.find((q) => q.code === a.qualification)?.label ?? "—");
  kv("Excluderi (Art. 2)", labelsOf(a.scopeExclusions, SCOPE_EXCLUSIONS).join("; ") || "niciuna");
  kv("Rolul firmei", ROLE_OPTIONS.find((r) => r.code === a.role)?.label ?? "—");
  kv("Practici interzise", labelsOf(a.prohibited, PROHIBITED_PRACTICES).join("; ") || "niciuna");
  kv("Anexa III", labelsOf(a.annexIII, ANNEX_III_USES).join("; ") || "niciuna");
  kv("Anexa I", a.annexI ? "da" : "nu");
  kv("Transparență (Art. 50)", labelsOf(a.transparency, TRANSPARENCY_TRIGGERS).join("; ") || "niciuna");
  kv("Context", [
    a.workplace && "folosit la locul de muncă",
    a.decisionsOnPersons && "ia sau asistă decizii despre persoane",
    a.publicService && "organism de drept public / servicii publice",
    a.publicAuthority && "autoritate publică",
    a.profiling && "profilare",
  ].filter(Boolean).join("; ") || "—");
  if (data.system.source === "portal") p("Informațiile au fost transmise de client prin portal.", { size: 8.5, color: MUTED });

  // Obligații
  h1(`3. Obligații (${data.obligations.length})`);
  if (!data.obligations.length) p("Nicio obligație.", { color: MUTED });
  for (const o of data.obligations) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 50) doc.addPage();
    p(`${o.article} — ${o.title}`, { bold: true, size: 9.5 });
    p(`Se aplică din ${fmtDate(o.appliesFrom)} · Stare: ${OBLIGATION_STATUS_LABELS[o.status]}${o.dueDate ? ` · Termen intern: ${fmtDate(o.dueDate)}` : ""}`, { size: 8.5, color: MUTED });
    if (o.note) p(`Notă: ${o.note}`, { size: 8.5, color: "#334155" });
    doc.moveDown(0.35);
  }

  // Memoriu
  if (data.memo) {
    h1("4. Memoriu de analiză (generat cu AI)");
    p("Material de lucru generat automat pe baza textului oficial; concluziile juridice sunt cele din secțiunea 1, aprobate de avocat.", { size: 8.5, color: MUTED });
    doc.moveDown(0.2);
    for (const line of data.memo.text.split("\n")) {
      const t = line.replace(/\*\*/g, "");
      if (/^#{1,3}\s/.test(t)) { doc.moveDown(0.2); p(t.replace(/^#{1,3}\s/, ""), { bold: true }); }
      else if (t.trim()) p(t.replace(/^\s*[-*]\s/, "• "));
    }
    if (data.memo.citations.length) {
      doc.moveDown(0.4);
      p("Surse din textul oficial:", { bold: true, size: 9 });
      for (const ci of data.memo.citations) p(`[${ci.n}] ${ci.ref}: „${ci.quote.length > 400 ? `${ci.quote.slice(0, 400)}…` : ci.quote}”`, { size: 8.5, color: "#334155" });
    }
  }

  // Integritate
  doc.moveDown(1);
  if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + width, doc.y).lineWidth(0.5).strokeColor("#cbd5e1").stroke();
  doc.moveDown(0.5);
  p("Integritate", { bold: true, size: 9 });
  p(`Amprentă SHA-256: ${row.sha256}`, { size: 8, color: MUTED });
  if (opts.intact === false) {
    p("ATENȚIE: conținutul acestui aviz nu mai corespunde amprentei înregistrate la aprobare. Documentul nu poate fi folosit ca dovadă până la clarificare.", { bold: true, size: 9, color: "#b91c1c" });
  }
  p("Instantaneul este imuabil: reflectă analiza la data avizului. Modificările ulterioare ale răspunsurilor, ale legii sau ale regulilor nu îl afectează. Încadrarea propusă de aplicație a fost verificată și aprobată de avocatul menționat; documentul nu înlocuiește analiza juridică a acestuia.", { size: 8, color: MUTED });

  // Subsol pe fiecare pagină
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("R").fontSize(7.5).fillColor(MUTED).text(
      `${data.cabinet.name} · Aviz AI Act · ${data.system.name} · v${row.version} · Pagina ${i - range.start + 1} din ${range.count}`,
      doc.page.margins.left, doc.page.height - 40, { width, align: "center" },
    );
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
