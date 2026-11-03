/**
 * Documentele GDPR: registrul activităților de prelucrare (Art. 30) și proiectul notificării
 * unui incident către ANSPDCP (Art. 33). Proiecte — avocatul le verifică înainte de transmitere.
 */
import { Packer, Paragraph, Table } from "docx";
import {
  BREACH_RISK_LABELS, BREACH_TYPES, DATA_CATEGORIES, LEGAL_BASES, PROCESSING_ROLES, SECURITY_MEASURES, SPECIAL_CONDITIONS,
  SUBJECT_CATEGORIES, TRANSFER_MECHANISMS, breachDeadline, checkProcessing, type GdprOption,
} from "@togato/shared";
import type { breaches, processingActivities } from "../../db/schema";
import {
  PAGE_WIDTH, bold, buildDocument, factsTable, fill, h1, h2, note, para, slug, spacer, table, titleBlock, type DocContext,
} from "./common";

type Block = Paragraph | Table;
type Activity = typeof processingActivities.$inferSelect;
type Breach = typeof breaches.$inferSelect;

const labels = (list: GdprOption[], codes: string[]) => codes.map((c) => list.find((o) => o.code === c)?.label ?? c).join("; ");
const fmtDateTime = (d: Date | null) => (d ? d.toLocaleString("ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" }) : "—");

const gdprNotice = () => note([
  bold("Proiect generat automat. "),
  "Documentul a fost pregătit în Togato pe baza datelor introduse de cabinet. Câmpurile evidențiate cu galben trebuie completate, iar conținutul trebuie verificat de avocat înainte de utilizare.",
]);

export function ropaBlocks(ctx: DocContext, activities: Activity[], aiNames: Map<string, string>): Block[] {
  const blocks: Block[] = [
    ...titleBlock(ctx, "Registrul activităților de prelucrare", "Art. 30 din Regulamentul (UE) 2016/679 (GDPR)"),
    h1("Operatorul"),
    factsTable([
      ["Denumire", ctx.client.name],
      ["CUI / Nr. Reg. Com.", [ctx.client.cui, ctx.client.regCom].filter(Boolean).join(" / ") || fill("CUI și număr de înregistrare")],
      ["Sediu", [ctx.client.address, ctx.client.city, ctx.client.county].filter(Boolean).join(", ") || fill("adresa sediului")],
      ["Persoana de contact", ctx.client.contactName ? `${ctx.client.contactName}${ctx.client.contactEmail ? `, ${ctx.client.contactEmail}` : ""}` : fill("nume, email, telefon")],
      ["Responsabil cu protecția datelor (DPO)", fill("nume și date de contact, dacă a fost desemnat (Art. 37)")],
    ]),
    h1("Sinteză"),
    activities.length
      ? table([500, 2600, 2100, 2200, PAGE_WIDTH - 7400], ["Nr.", "Activitate", "Temei legal", "Persoane vizate", "Păstrare"],
        activities.map((a, i) => [String(i + 1), a.name, labels(LEGAL_BASES, a.legalBases) || "—", labels(SUBJECT_CATEGORIES, a.subjectCategories) || "—", a.retention || "—"]), { size: 18 })
      : para(fill("nicio activitate înregistrată")),
  ];
  activities.forEach((a, i) => {
    const check = checkProcessing({ ...a, recipients: a.recipients, usesAi: a.aiSystemIds.length > 0 });
    const role = PROCESSING_ROLES.find((r) => r.code === a.role)?.label ?? a.role;
    blocks.push(
      h1(`${i + 1}. ${a.name}`),
      factsTable([
        ["Calitatea firmei", `${role}${a.controllerName ? ` — pentru ${a.controllerName}` : ""}`],
        ["Scopul prelucrării", a.purpose],
        ["Temeiul legal (Art. 6)", `${labels(LEGAL_BASES, a.legalBases) || "—"}${a.legalBasisDetails ? `. ${a.legalBasisDetails}` : ""}`],
        ...(a.specialConditions.length ? [["Condiția pentru categorii speciale (Art. 9)", labels(SPECIAL_CONDITIONS, a.specialConditions)] as [string, string]] : []),
        ["Categorii de persoane vizate", labels(SUBJECT_CATEGORIES, a.subjectCategories) || fill("categoriile de persoane")],
        ["Categorii de date", labels(DATA_CATEGORIES, a.dataCategories) || fill("categoriile de date")],
        ["Destinatari", a.recipients || fill("cui se divulgă datele (ex. contabilitate externă, ANAF, ITM, furnizori IT)")],
        ["Transferuri în afara SEE", a.transferOutsideEea ? `${a.transferCountries || fill("țările")} — ${labels(TRANSFER_MECHANISMS, a.transferMechanism ? [a.transferMechanism] : []) || fill("mecanismul de transfer")}` : "Nu"],
        ["Termene de ștergere", a.retention || fill("termenul de păstrare")],
        ["Măsuri de securitate (Art. 32)", [labels(SECURITY_MEASURES, a.securityMeasures), a.securityDetails].filter(Boolean).join(". ") || fill("măsurile tehnice și organizatorice")],
        ...(a.aiSystemIds.length ? [["Sisteme AI folosite", a.aiSystemIds.map((id) => aiNames.get(id) ?? "—").join(", ")] as [string, string]] : []),
        ["Evaluare de impact (Art. 35)", check.dpiaLikely ? `Probabil necesară (${check.dpiaReasons.join(", ")})` : "Nu rezultă necesară din criteriile introduse"],
      ]),
    );
    if (check.issues.length) blocks.push(h2("De completat"), ...check.issues.map((t) => para([fill(t)])));
  });
  blocks.push(spacer(), gdprNotice());
  return blocks;
}

export function breachNotificationBlocks(ctx: DocContext, b: Breach): Block[] {
  const deadline = breachDeadline(b.discoveredAt);
  const late = (b.authorityNotifiedAt ?? new Date()) > deadline;
  return [
    ...titleBlock(ctx, "Notificarea încălcării securității datelor", "Către Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal — Art. 33 GDPR"),
    note([bold("Atenție: "), "ANSPDCP primește notificările prin formularul publicat pe dataprotection.ro. Folosiți acest document pentru a pregăti răspunsurile și pentru dosarul intern."]),
    h1("1. Operatorul"),
    factsTable([
      ["Denumire", `${ctx.client.name}${ctx.client.cui ? `, CUI ${ctx.client.cui}` : ""}`],
      ["Sediu", [ctx.client.address, ctx.client.city, ctx.client.county].filter(Boolean).join(", ") || fill("adresa")],
      ["Persoana de contact / DPO", fill("nume, funcție, telefon, email")],
    ]),
    h1("2. Descrierea încălcării"),
    factsTable([
      ["Denumire internă", b.title],
      ["Tipul încălcării", labels(BREACH_TYPES, b.breachTypes) || fill("confidențialitate / integritate / disponibilitate")],
      ["Data și ora producerii", b.occurredAt ? fmtDateTime(b.occurredAt) : fill("data și ora, sau intervalul estimat")],
      ["Data și ora luării la cunoștință", fmtDateTime(b.discoveredAt)],
      ["Termenul de notificare (72 de ore)", fmtDateTime(deadline)],
      ["Descriere", b.description || fill("ce s-a întâmplat, cum a fost descoperit")],
    ]),
    h1("3. Datele și persoanele afectate"),
    factsTable([
      ["Categorii de date", labels(DATA_CATEGORIES, b.dataCategories) || fill("categoriile de date")],
      ["Număr aproximativ de persoane vizate", b.subjectsAffected != null ? String(b.subjectsAffected) : fill("număr aproximativ")],
      ["Număr aproximativ de înregistrări", b.recordsAffected != null ? String(b.recordsAffected) : fill("număr aproximativ")],
    ]),
    h1("4. Consecințe probabile și evaluarea riscului"),
    factsTable([
      ["Evaluarea riscului", BREACH_RISK_LABELS[b.risk]],
      ["Motivare", b.riskReasoning || fill("de ce acest nivel de risc")],
      ["Consecințe probabile", b.consequences || fill("ex. pierderea controlului asupra datelor, fraudă, discriminare")],
    ]),
    h1("5. Măsuri luate sau propuse"),
    para(b.measures || fill("măsurile pentru remedierea încălcării și reducerea efectelor")),
    h1("6. Informarea persoanelor vizate (Art. 34)"),
    para(b.risk === "risc_ridicat"
      ? (b.subjectsNotifiedAt ? `Persoanele vizate au fost informate la ${fmtDateTime(b.subjectsNotifiedAt)}.` : fill("data și modul informării persoanelor vizate, într-un limbaj clar și simplu"))
      : "Nu se impune, riscul nefiind ridicat."),
    ...(late ? [h1("7. Motivele întârzierii"), para(b.delayReason || fill("notificarea depășește 72 de ore — explicați motivele (Art. 33(1))"))] : []),
    spacer(),
    gdprNotice(),
  ];
}

export async function renderGdprDocument(ctx: DocContext, title: string, blocks: Block[]) {
  const buffer = await Packer.toBuffer(buildDocument(ctx, title, blocks));
  return { buffer, filename: `${slug(title)}_${slug(ctx.client.name)}_${ctx.generatedAt.toISOString().slice(0, 10)}.docx` };
}

