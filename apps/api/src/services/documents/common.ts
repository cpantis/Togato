/**
 * Piese comune pentru documentele Word generate de Togato:
 * stiluri, antet cu numele cabinetului, tabele, câmpuri „de completat” evidențiate.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { and, asc, eq } from "drizzle-orm";
import { RISK_LABELS, normalizeAnswers, type AiSystemAnswers, type ClassificationResult, type RiskLevel } from "@togato/shared";
import { db } from "../../db";
import { aiSystems, clients, obligations, organizations, users } from "../../db/schema";

export const BRAND = "7A1F3A";
export const MUTED = "64748B";
/** lățimea utilă A4 cu margini de 2 cm (DXA) */
export const PAGE_WIDTH = 9638;

// ─── Datele unui dosar de client ─────────────────────────

export interface DocSystem {
  id: string;
  name: string;
  vendor: string | null;
  description: string | null;
  purpose: string | null;
  department: string | null;
  answers: AiSystemAnswers;
  riskLevel: RiskLevel | "neclasificat";
  classification: ClassificationResult | null;
  reviewStatus: "propus" | "aprobat" | "respins";
  reviewedByName: string | null;
  reviewedAt: Date | null;
  obligations: (typeof obligations.$inferSelect)[];
}

export interface DocContext {
  cabinetName: string;
  preparedBy: string;
  generatedAt: Date;
  client: typeof clients.$inferSelect;
  responsibleName: string | null;
  systems: DocSystem[];
  clientObligations: (typeof obligations.$inferSelect)[];
}

export async function loadDocContext(organizationId: string, clientId: string, preparedBy: string): Promise<DocContext | null> {
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)) });
  if (!client) return null;
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
  const responsible = client.responsibleUserId
    ? await db.query.users.findFirst({ where: eq(users.id, client.responsibleUserId), columns: { name: true } })
    : null;
  const systems = await db.query.aiSystems.findMany({
    where: and(eq(aiSystems.clientId, clientId), eq(aiSystems.organizationId, organizationId)),
    with: { reviewer: { columns: { name: true } } },
    orderBy: [asc(aiSystems.name)],
  });
  const allObligations = await db.select().from(obligations)
    .where(and(eq(obligations.clientId, clientId), eq(obligations.organizationId, organizationId)))
    .orderBy(asc(obligations.appliesFrom), asc(obligations.article));

  return {
    cabinetName: org?.name ?? "Cabinet",
    preparedBy,
    generatedAt: new Date(),
    client,
    responsibleName: responsible?.name ?? null,
    systems: systems.map((s) => ({
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      description: s.description,
      purpose: s.purpose,
      department: s.department,
      answers: normalizeAnswers(s.answers),
      riskLevel: s.riskLevel,
      classification: s.classification,
      reviewStatus: s.reviewStatus,
      reviewedByName: s.reviewer?.name ?? null,
      reviewedAt: s.reviewedAt,
      obligations: allObligations.filter((o) => o.aiSystemId === s.id),
    })),
    clientObligations: allObligations.filter((o) => o.aiSystemId === null),
  };
}

// ─── Formatare ───────────────────────────────────────────

export function formatDateRo(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value;
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}

export const riskLabel = (r: RiskLevel | "neclasificat") => RISK_LABELS[r];

export const STATUS_LABELS: Record<string, string> = {
  de_facut: "De făcut",
  in_lucru: "În lucru",
  indeplinit: "Îndeplinit",
  nu_se_aplica: "Nu se aplică",
};

export const REVIEW_LABELS: Record<string, string> = {
  propus: "Propusă, neverificată",
  aprobat: "Aprobată de avocat",
  respins: "Respinsă, de reanalizat",
};

export function slug(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "client";
}

// ─── Blocuri de text ─────────────────────────────────────

export type Run = string | TextRun;
const toRuns = (parts: Run | Run[]) => (Array.isArray(parts) ? parts : [parts]).map((r) => (typeof r === "string" ? new TextRun(r) : r));

export const bold = (text: string) => new TextRun({ text, bold: true });
export const italic = (text: string) => new TextRun({ text, italics: true });
/** Câmp de completat de avocat — evidențiat cu galben */
export const fill = (hint: string) => new TextRun({ text: `[de completat: ${hint}]`, highlight: "yellow" });

export const para = (parts: Run | Run[], opts: { after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ spacing: { after: opts.after ?? 120 }, alignment: opts.align, children: toRuns(parts) });
export const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
export const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
export const bullet = (parts: Run | Run[]) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: toRuns(parts) });
export const numbered = (parts: Run | Run[], instance = 1) => new Paragraph({ numbering: { reference: "numbers", level: 0, instance }, spacing: { after: 80 }, children: toRuns(parts) });
export const spacer = () => new Paragraph({ spacing: { after: 120 }, children: [] });

export function note(parts: Run | Run[]) {
  return new Paragraph({
    spacing: { before: 120, after: 200 },
    indent: { left: 200, right: 200 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 10 } },
    shading: { fill: "F8EDF0", type: ShadingType.CLEAR, color: "auto" },
    children: toRuns(parts),
  });
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "D9DEE5" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

/** Tabel cu antet colorat. `widths` în DXA, însumate = PAGE_WIDTH. */
export function table(widths: number[], header: string[] | null, rows: (Run | Run[])[][], opts: { firstColBold?: boolean; size?: number } = {}) {
  const size = opts.size ?? 19;
  const mk = (content: Run | Run[], i: number, head: boolean, zebra: boolean) => new TableCell({
    borders,
    width: { size: widths[i], type: WidthType.DXA },
    shading: { fill: head ? BRAND : zebra ? "F8F9FB" : "FFFFFF", type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [new Paragraph({
      children: toRuns(content).map((r) => (head ? new TextRun({ text: String(content), bold: true, color: "FFFFFF", size }) : r)),
    })],
  });
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      ...(header ? [new TableRow({ tableHeader: true, children: header.map((h, i) => mk(h, i, true, false)) })] : []),
      ...rows.map((r, ri) => new TableRow({
        cantSplit: true,
        children: r.map((c, i) => mk(opts.firstColBold && i === 0 && typeof c === "string" ? bold(c) : c, i, false, ri % 2 === 1)),
      })),
    ],
  });
}

/** Tabel cu perechi etichetă / valoare */
export function factsTable(rows: [string, Run | Run[]][]) {
  return table([2900, PAGE_WIDTH - 2900], null, rows.map(([k, v]) => [bold(k), v]));
}

export function signatureBlock(left: string, right: string) {
  return table([PAGE_WIDTH / 2, PAGE_WIDTH / 2], null, [[
    [bold(left), new TextRun({ text: "", break: 1 }), new TextRun({ text: "Nume: ______________________", break: 1 }), new TextRun({ text: "Semnătura: _________________", break: 1 }), new TextRun({ text: "Data: ______________________", break: 1 })],
    [bold(right), new TextRun({ text: "", break: 1 }), new TextRun({ text: "Nume: ______________________", break: 1 }), new TextRun({ text: "Semnătura: _________________", break: 1 }), new TextRun({ text: "Data: ______________________", break: 1 })],
  ]]);
}

// ─── Documentul ──────────────────────────────────────────

export function titleBlock(ctx: DocContext, title: string, subtitle: string) {
  return [
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, size: 40, color: BRAND })] }),
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND, space: 6 } },
      children: [new TextRun({ text: subtitle, size: 24, color: "334155" })],
    }),
    factsTable([
      ["Client", `${ctx.client.name}${ctx.client.cui ? ` (CUI ${ctx.client.cui})` : ""}`],
      ["Întocmit de", `${ctx.cabinetName}${ctx.responsibleName ? ` — ${ctx.responsibleName}` : ""}`],
      ["Data", formatDateRo(ctx.generatedAt)],
    ]),
    spacer(),
  ];
}

export function draftNotice() {
  return note([
    bold("Proiect generat automat. "),
    "Documentul a fost pregătit în Togato pe baza inventarului AI și a încadrării din aplicație. Câmpurile evidențiate cu galben trebuie completate, iar conținutul trebuie verificat de avocat înainte de transmiterea către client.",
  ]);
}

export function buildDocument(ctx: DocContext, title: string, children: (Paragraph | Table)[]) {
  return new Document({
    creator: ctx.cabinetName,
    title: `${title} — ${ctx.client.name}`,
    description: `Generat în Togato de ${ctx.preparedBy}`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 21, color: "1E293B" } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, color: BRAND }, paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0, keepNext: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, color: "0F172A" }, paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1, keepNext: true } },
      ],
    },
    numbering: {
      config: [
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
        { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      headers: {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${ctx.cabinetName} · ${title}`, size: 16, color: MUTED })] })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Pagina ", PageNumber.CURRENT, " din ", PageNumber.TOTAL_PAGES], size: 16, color: MUTED })] })] }),
      },
      children,
    }],
  });
}
