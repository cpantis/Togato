/**
 * Documentele GDPR: registrul activităților de prelucrare (Art. 30) și proiectul notificării
 * unui incident către ANSPDCP (Art. 33). Proiecte — avocatul le verifică înainte de transmitere.
 */
import { Packer, Paragraph, Table } from "docx";
import {
  BREACH_RISK_LABELS, BREACH_TYPES, DATA_CATEGORIES, LEGAL_BASES, PROCESSING_ROLES, SECURITY_MEASURES, SPECIAL_CONDITIONS,
  SUBJECT_CATEGORIES, TRANSFER_MECHANISMS, breachDeadline, checkProcessing, type GdprOption,
  ANSPDCP_DPIA_LIST, DPIA_LIKELIHOOD_LABELS, DPIA_OUTCOME_LABELS, DPIA_RISK_LABELS, DPIA_SEVERITY_LABELS, DSAR_TYPES, assessDpia, dpiaRiskLevel, type DsarLetter,
} from "@togato/shared";
import type { breaches, dpias, dsarRequests, processingActivities } from "../../db/schema";
import {
  PAGE_WIDTH, bold, buildDocument, bullet, factsTable, fill, formatDateRo, h1, h2, note, para, signatureBlock, slug, spacer, table, titleBlock, type DocContext,
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

// ─── Evaluarea de impact (Art. 35) ───────────────────────

type DpiaRow = typeof dpias.$inferSelect;

export function dpiaBlocks(ctx: DocContext, a: Activity, d: DpiaRow): Block[] {
  const check = checkProcessing({ ...a, usesAi: a.aiSystemIds.length > 0 });
  const result = assessDpia({ necessity: d.necessity, risks: d.risks });
  const lines = (t: string | null) => (t ?? "").split("\n").filter((l) => l.trim()).map((l) => para(l));
  return [
    ...titleBlock(ctx, "Evaluarea impactului asupra protecției datelor", `${a.name} — Art. 35 din Regulamentul (UE) 2016/679`),
    factsTable([
      ["Stadiu", d.finalizedAt ? `Finalizată la ${formatDateRo(d.finalizedAt)}` : "Proiect"],
      ["Concluzie", result.missing.length ? `Provizorie (evaluare incompletă): ${DPIA_OUTCOME_LABELS[result.outcome].toLowerCase()}` : DPIA_OUTCOME_LABELS[result.outcome]],
      ["Revizuire", d.reviewOn ? formatDateRo(d.reviewOn) : fill("data reevaluării (cel puțin la schimbarea riscurilor)")],
    ]),
    h1("1. De ce este necesară evaluarea"),
    ...(check.dpiaMandatory ? check.dpiaMandatoryReasons.map((r) => bullet(r)) : check.dpiaReasons.length ? [para(`Criterii de risc (EDPB, WP248): ${check.dpiaReasons.join(", ")}.`)] : [para("Evaluare realizată din prudență, deși criteriile introduse nu o impun.")]),
    h1("2. Descrierea sistematică a operațiunilor (Art. 35(7)(a))"),
    ...(d.description?.trim() ? lines(d.description) : [para(fill("natura, domeniul, contextul și scopurile prelucrării"))]),
    h1("3. Necesitate și proporționalitate (Art. 35(7)(b))"),
    ...(d.necessity?.trim() ? lines(d.necessity) : [para(fill("de ce prelucrarea e necesară pentru scop și de ce nu există o alternativă mai puțin intruzivă; minimizare, păstrare, informarea persoanelor, exercitarea drepturilor"))]),
    h1("4. Riscuri pentru drepturile și libertățile persoanelor (Art. 35(7)(c)–(d))"),
    table([2300, 1500, 2700, PAGE_WIDTH - 6500], ["Risc", "Inițial", "Măsuri de atenuare", "Rezidual"],
      d.risks.map((r) => [
        [bold(r.title), r.description ? `\n${r.description}` : ""],
        `${DPIA_RISK_LABELS[dpiaRiskLevel(r.likelihood, r.severity)]} (probabilitate ${DPIA_LIKELIHOOD_LABELS[r.likelihood].toLowerCase()}, gravitate ${DPIA_SEVERITY_LABELS[r.severity].toLowerCase()})`,
        r.measures || fill("măsurile"),
        DPIA_RISK_LABELS[dpiaRiskLevel(r.residualLikelihood, r.residualSeverity)],
      ]), { size: 18 }),
    h1("5. Consultări"),
    factsTable([
      ["Avizul responsabilului cu protecția datelor (Art. 35(2))", d.dpoOpinion || fill("avizul DPO, dacă a fost desemnat")],
      ["Opinia persoanelor vizate sau a reprezentanților lor (Art. 35(9))", d.subjectsViews || fill("după caz — sau motivul pentru care nu a fost solicitată")],
    ]),
    h1("6. Concluzie"),
    para([bold(result.missing.length ? `Provizorie — ${DPIA_OUTCOME_LABELS[result.outcome].toLowerCase()}` : DPIA_OUTCOME_LABELS[result.outcome]), "."]),
    ...(result.outcome === "consultare_prealabila" ? [note([bold("Atenție: "), "riscul rezidual ridicat impune consultarea ANSPDCP înainte de începerea prelucrării (Art. 36). Prelucrarea nu începe până la răspunsul autorității."])] : []),
    ...(result.missing.length ? [h2("De completat înainte de finalizare"), ...result.missing.map((m) => para([fill(m)]))] : []),
    spacer(),
    signatureBlock(`Pentru ${ctx.client.name}`, "Responsabil cu protecția datelor / avocat"),
    spacer(),
    gdprNotice(),
  ];
}

// ─── Scrisorile pentru cererile persoanelor vizate ───────

type Dsar = typeof dsarRequests.$inferSelect;
const ANSPDCP_CONTACT = "Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal, B-dul G-ral. Gheorghe Magheru nr. 28-30, sector 1, București, www.dataprotection.ro";

function letterHead(ctx: DocContext, d: Dsar, subject: string): Block[] {
  const c = ctx.client;
  return [
    para([bold(c.name)], { after: 0 }),
    para([c.address || fill("adresa"), c.city ? `, ${c.city}` : "", c.county ? `, jud. ${c.county}` : ""], { after: 0 }),
    para(c.cui ? `CUI ${c.cui}` : fill("CUI")),
    spacer(),
    para(`Data: ${formatDateRo(new Date())}`),
    para([bold("Către: "), d.requesterName, d.requesterContact ? ` (${d.requesterContact})` : ""]),
    para([bold("Referitor la: "), subject]),
    spacer(),
    para(`Stimate/Stimată ${d.requesterName},`),
  ];
}

function letterEnd(ctx: DocContext): Block[] {
  return [
    para(`Pentru orice întrebare privind prelucrarea datelor dumneavoastră ne puteți contacta la ${ctx.client.contactEmail || "[adresa de contact]"}.`),
    spacer(),
    para("Cu stimă,"),
    para([bold(ctx.client.name)], { after: 0 }),
    para(fill("nume, funcție, semnătură")),
    spacer(),
    gdprNotice(),
  ];
}

const rightsParagraph = () => para(`Aveți dreptul de a depune o plângere la ${ANSPDCP_CONTACT}, precum și dreptul de a vă adresa instanței competente.`);

export function dsarLetterBlocks(ctx: DocContext, d: Dsar, kind: DsarLetter, acts: Activity[]): Block[] {
  const type = DSAR_TYPES.find((t) => t.code === d.type)!;
  const req = `cererea dumneavoastră privind ${type.label.toLowerCase()} (${type.article} din Regulamentul (UE) 2016/679), primită la ${formatDateRo(d.receivedOn)}`;
  const subject = `${type.label} — ${type.article} GDPR`;
  switch (kind) {
    case "confirmare":
      return [...letterHead(ctx, d, subject),
        para(`Vă confirmăm primirea ${req}.`),
        para(`Vom răspunde fără întârzieri nejustificate și cel târziu până la ${formatDateRo(d.dueOn)}, conform art. 12 alin. (3) din Regulamentul (UE) 2016/679. Vă vom informa dacă, din cauza complexității sau a numărului cererilor, termenul trebuie prelungit.`),
        ...letterEnd(ctx)];
    case "identitate":
      return [...letterHead(ctx, d, subject),
        para(`Am primit ${req}.`),
        para("Pentru a ne asigura că datele personale sunt comunicate sau modificate doar la cererea persoanei căreia îi aparțin, vă rugăm să ne transmiteți următoarele informații suplimentare, necesare pentru confirmarea identității (art. 12 alin. (6)):"),
        bullet(fill("informațiile strict necesare, ex. numărul de client, adresa de email folosită în relația cu noi")),
        para("Vom folosi aceste informații exclusiv pentru verificarea identității. Vom răspunde cererii după confirmarea identității, în termenul legal."),
        ...letterEnd(ctx)];
    case "prelungire":
      return [...letterHead(ctx, d, subject),
        para(`Referitor la ${req}, vă informăm că termenul de răspuns se prelungește cu două luni, până la ${formatDateRo(d.dueOn)}, conform art. 12 alin. (3).`),
        para([bold("Motivele prelungirii: "), d.extensionReason || fill("motivele")]),
        ...letterEnd(ctx)];
    case "refuz":
      return [...letterHead(ctx, d, subject),
        para(`Am analizat ${req}.`),
        para(["Vă informăm că nu putem da curs cererii, pentru următoarele motive: ", d.outcome ? d.outcome : fill("motivele refuzului — ex. cerere vădit nefondată sau excesivă (art. 12 alin. (5)), excepțiile din art. 17 alin. (3), interes legitim imperios (art. 21 alin. (1))")]),
        rightsParagraph(),
        ...letterEnd(ctx)];
    default:
      return [...letterHead(ctx, d, subject), para(`Ca răspuns la ${req}, vă comunicăm următoarele.`), ...responseBody(d, acts), rightsParagraph(), ...letterEnd(ctx)];
  }
}

function responseBody(d: Dsar, acts: Activity[]): Block[] {
  switch (d.type) {
    case "acces":
      return [
        para("Confirmăm că prelucrăm date cu caracter personal care vă privesc. Potrivit art. 15, vă comunicăm:"),
        ...(acts.length ? acts.flatMap((a) => [
          h2(a.name),
          factsTable([
            ["Scopul", a.purpose],
            ["Categoriile de date", labels(DATA_CATEGORIES, a.dataCategories) || "—"],
            ["Destinatarii", a.recipients || "—"],
            ["Perioada de stocare", a.retention || "—"],
            ...(a.transferOutsideEea ? [["Transfer în afara SEE", `${a.transferCountries || ""} — ${labels(TRANSFER_MECHANISMS, a.transferMechanism ? [a.transferMechanism] : [])}`] as [string, string]] : []),
          ]),
        ]) : [para(fill("scopurile, categoriile de date, destinatarii și perioada de stocare"))]),
        note([bold("De verificat: "), "păstrați doar activitățile care privesc efectiv solicitantul; ștergeți-le pe celelalte înainte de trimitere."]),
        para(["Sursa datelor: ", fill("datele au fost colectate direct de la dumneavoastră / din altă sursă (indicați)")]),
        para(["Decizii automate, inclusiv crearea de profiluri: ", fill("nu este cazul / logica utilizată și consecințele (art. 22)")]),
        para("Aveți dreptul de a solicita rectificarea sau ștergerea datelor, restricționarea prelucrării și de a vă opune prelucrării, în condițiile art. 16–21."),
        para(["Anexăm o copie a datelor cu caracter personal care fac obiectul prelucrării (art. 15 alin. (3)): ", fill("modul de transmitere — ex. fișier criptat, parola comunicată separat")]),
      ];
    case "stergere":
      return [
        para(["Datele dumneavoastră cu caracter personal au fost șterse la data de ", fill("data"), " din: ", fill("sistemele / evidențele")]),
        para(["Excepție: păstrăm următoarele date, în temeiul art. 17 alin. (3): ", fill("ex. documentele contabile, pentru respectarea unei obligații legale, până la expirarea termenului legal — sau „nu este cazul”")]),
        para("Am informat destinatarii cărora le-au fost divulgate datele, conform art. 19, cu excepția cazului în care acest lucru s-a dovedit imposibil sau a presupus eforturi disproporționate."),
      ];
    case "rectificare":
      return [
        para(["Datele au fost rectificate / completate la data de ", fill("data"), ": ", fill("ce date au fost corectate")]),
        para("Am informat destinatarii cărora le-au fost divulgate datele, conform art. 19."),
      ];
    case "restrictionare":
      return [
        para(["Prelucrarea datelor a fost restricționată începând cu ", fill("data"), ", pentru motivul: ", fill("art. 18 alin. (1) lit. a)–d)")]),
        para("Pe durata restricționării, datele vor fi doar stocate, cu excepțiile din art. 18 alin. (2). Vă vom informa înainte de ridicarea restricției."),
      ];
    case "portabilitate":
      return [
        para(["Vă transmitem datele furnizate de dumneavoastră și prelucrate automat, în temeiul consimțământului sau al unui contract, într-un format structurat, utilizat în mod curent și care poate fi citit automat: ", fill("formatul (ex. CSV, JSON) și modul de transmitere")]),
        para(["La cererea dumneavoastră, datele au fost / pot fi transmise direct operatorului: ", fill("operatorul indicat, dacă este fezabil tehnic — sau „nu este cazul”")]),
      ];
    case "opozitie":
      return [
        para(["Am încetat prelucrarea datelor dumneavoastră în scopul: ", fill("scopul")]),
        para("În cazul opoziției față de prelucrarea în scop de marketing direct, datele nu mai sunt prelucrate în acest scop (art. 21 alin. (3)). Pentru alte scopuri, prelucrarea continuă doar dacă demonstrăm motive legitime și imperioase care prevalează sau pentru apărarea unui drept în instanță."),
      ];
    case "decizii_automate":
      return [
        para(["Decizia care vă privește a fost reanalizată de o persoană: ", fill("nume / funcție, data, rezultatul reanalizării")]),
        para("Potrivit art. 22 alin. (3), aveți dreptul de a obține intervenție umană, de a vă exprima punctul de vedere și de a contesta decizia."),
      ];
  }
}

export async function renderGdprDocument(ctx: DocContext, title: string, blocks: Block[]) {
  const buffer = await Packer.toBuffer(buildDocument(ctx, title, blocks));
  return { buffer, filename: `${slug(title)}_${slug(ctx.client.name)}_${ctx.generatedAt.toISOString().slice(0, 10)}.docx` };
}

