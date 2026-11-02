/**
 * Conținutul celor cinci documente. Fiecare funcție primește dosarul clientului
 * (și, unde e cazul, un sistem AI) și întoarce paragrafele documentului.
 */
import { Paragraph, Table } from "docx";
import { ANNEX_III_USES, LEGAL_ROLE_LABELS, ROLE_OPTIONS, TRANSPARENCY_TRIGGERS } from "@togato/shared";
import {
  PAGE_WIDTH, REVIEW_LABELS, STATUS_LABELS, bold, bullet, draftNotice, factsTable, fill, formatDateRo, h1, h2, italic, note,
  numbered, para, riskLabel, signatureBlock, spacer, table, titleBlock, type DocContext, type DocSystem,
} from "./common";

type Block = Paragraph | Table;
const today = () => new Date().toISOString().slice(0, 10);
const roleText = (s: DocSystem) => {
  const r = s.classification?.role;
  return r === "implementator" || !r ? "implementator (utilizator)" : LEGAL_ROLE_LABELS[r].toLowerCase();
};
const labelOf = (list: { code: string; label: string }[], code: string) => list.find((o) => o.code === code)?.label ?? code;
const active = (list: DocSystem["obligations"]) => list.filter((o) => o.status !== "nu_se_aplica");

// ─── 1. Raport de conformitate ───────────────────────────

export function complianceReport(ctx: DocContext): Block[] {
  const all = [...ctx.clientObligations, ...ctx.systems.flatMap((s) => s.obligations)];
  const act = active(all);
  const done = act.filter((o) => o.status === "indeplinit").length;
  const order = ["interzis", "risc_ridicat", "transparenta", "minim", "neclasificat"] as const;
  const counts = order.map((r) => [r, ctx.systems.filter((s) => s.riskLevel === r).length] as const).filter(([, n]) => n > 0);
  const open = act.filter((o) => o.status === "de_facut" || o.status === "in_lucru");
  const inForce = open.filter((o) => o.appliesFrom <= today());
  const upcoming = open.filter((o) => o.appliesFrom > today());
  const nameOf = (id: string | null) => (id ? ctx.systems.find((s) => s.id === id)?.name ?? "—" : "Firma în ansamblu");

  const blocks: Block[] = [
    ...titleBlock(ctx, "Raport de conformitate AI Act", "Situația sistemelor de inteligență artificială și a obligațiilor"),
    h1("1. Rezumat"),
    para([`Am analizat ${ctx.systems.length === 1 ? "un sistem AI folosit" : `${ctx.systems.length} sisteme AI folosite`} de ${ctx.client.name} în raport cu Regulamentul (UE) 2024/1689 privind inteligența artificială (AI Act). `,
      `Din ${act.length} obligații aplicabile, `, bold(`${done} sunt îndeplinite`), ` (${act.length ? Math.round((done / act.length) * 100) : 0}%).`]),
  ];
  if (counts.length) {
    blocks.push(table([4800, PAGE_WIDTH - 4800], ["Nivel de risc", "Număr de sisteme"], counts.map(([r, n]) => [riskLabel(r), String(n)]), { firstColBold: true }));
  }
  const prohibited = ctx.systems.filter((s) => s.riskLevel === "interzis");
  if (prohibited.length) {
    blocks.push(note([bold("Atenție: "), `${prohibited.map((s) => s.name).join(", ")} intră sub incidența practicilor interzise (Art. 5), aplicabile din 2 februarie 2025. Recomandăm oprirea imediată a utilizării.`]));
  }

  blocks.push(h1("2. Inventarul sistemelor AI"));
  if (!ctx.systems.length) {
    blocks.push(para(italic("Nu a fost inventariat niciun sistem AI.")));
  } else {
    blocks.push(table([2600, 1700, 1500, 1900, PAGE_WIDTH - 7700], ["Sistem", "Furnizor", "Nivel de risc", "Rolul firmei", "Încadrare"],
      ctx.systems.map((s) => [s.name, s.vendor || "—", riskLabel(s.riskLevel), roleText(s), REVIEW_LABELS[s.reviewStatus]]), { firstColBold: true, size: 18 }));
  }

  blocks.push(h1("3. Obligații în vigoare, încă neîndeplinite"));
  if (!inForce.length) blocks.push(para(italic("Toate obligațiile aflate deja în vigoare sunt îndeplinite.")));
  else blocks.push(table([2400, 1500, PAGE_WIDTH - 5300, 1400], ["Sistem", "Articol", "Obligație", "Stare"],
    inForce.map((o) => [nameOf(o.aiSystemId), o.article, o.title, STATUS_LABELS[o.status]]), { size: 18 }));

  blocks.push(h1("4. Obligații care urmează să se aplice"));
  if (!upcoming.length) blocks.push(para(italic("Nu există obligații viitoare deschise.")));
  else blocks.push(table([2300, 1400, PAGE_WIDTH - 5200, 1500], ["Sistem", "Articol", "Obligație", "Se aplică din"],
    upcoming.map((o) => [nameOf(o.aiSystemId), o.article, o.title, formatDateRo(o.appliesFrom)]), { size: 18 }));

  blocks.push(h1("5. Recomandări"));
  if (prohibited.length) blocks.push(numbered("Oprirea sistemelor încadrate ca practici interzise și documentarea opririi."));
  if (inForce.length) blocks.push(numbered(`Îndeplinirea celor ${inForce.length} obligații deja în vigoare, în ordinea din secțiunea 3.`));
  if (ctx.systems.some((s) => s.riskLevel === "risc_ridicat")) blocks.push(numbered("Pregătirea din timp a măsurilor pentru sistemele cu risc ridicat (supraveghere umană, jurnale, informarea persoanelor), înainte de data de aplicare."));
  blocks.push(numbered("Actualizarea inventarului AI la fiecare instrument nou adoptat și revizuirea anuală a încadrării."));
  blocks.push(numbered([fill("alte recomandări specifice clientului")]));
  blocks.push(spacer(), draftNotice());
  return blocks;
}

// ─── 2. Registrul sistemelor AI ──────────────────────────

export function aiRegister(ctx: DocContext): Block[] {
  const blocks: Block[] = [
    ...titleBlock(ctx, "Registrul sistemelor AI", "Evidența sistemelor de inteligență artificială folosite sau dezvoltate"),
    para("Registrul ține evidența tuturor sistemelor AI folosite sau dezvoltate de firmă, a încadrării lor potrivit AI Act și a responsabililor. Se actualizează la fiecare sistem nou, la orice schimbare de scop și cel puțin o dată pe an."),
    h1("Sinteză"),
    table([500, 2500, 1700, 1700, 1500, PAGE_WIDTH - 7900], ["Nr.", "Sistem", "Furnizor", "Departament", "Nivel de risc", "Rol"],
      ctx.systems.map((s, i) => [String(i + 1), s.name, s.vendor || "—", s.department || "—", riskLabel(s.riskLevel), LEGAL_ROLE_LABELS[s.classification?.role ?? "implementator"]]), { size: 18 }),
  ];
  ctx.systems.forEach((s, i) => {
    const act = active(s.obligations);
    const done = act.filter((o) => o.status === "indeplinit").length;
    blocks.push(
      h1(`${i + 1}. ${s.name}`),
      factsTable([
        ["Furnizor / producător", s.vendor || "—"],
        ["Departament", s.department || "—"],
        ["Scop", s.purpose || fill("scopul utilizării")],
        ["Descriere", s.description || fill("ce date intră, ce produce, cine folosește rezultatul")],
        ["Rolul firmei", ROLE_OPTIONS.find((r) => r.code === s.answers.role)?.label ?? "—"],
        ["Nivel de risc", riskLabel(s.riskLevel)],
        ["Temei", s.classification?.reasons.map((r) => `${r.article} — ${r.text}`).join("; ") || "—"],
        ["Verificare", `${REVIEW_LABELS[s.reviewStatus]}${s.reviewedByName ? `, ${s.reviewedByName}, ${formatDateRo(s.reviewedAt)}` : ""}`],
        ["Obligații îndeplinite", `${done} din ${act.length}`],
        ["Responsabil intern", fill("persoana din firmă responsabilă de sistem")],
        ["Data punerii în funcțiune", fill("data")],
      ]),
    );
  });
  blocks.push(spacer(), draftNotice());
  return blocks;
}

// ─── 3. Politica internă de utilizare AI ─────────────────

export function aiPolicy(ctx: DocContext): Block[] {
  const approved = ctx.systems.filter((s) => s.riskLevel !== "interzis");
  const c = ctx.client.name;
  return [
    ...titleBlock(ctx, "Politica internă de utilizare a inteligenței artificiale", c),
    h1("1. Scop și domeniu de aplicare"),
    para(`Prezenta politică stabilește regulile de utilizare a sistemelor de inteligență artificială (AI) în cadrul ${c}, pentru a asigura conformitatea cu Regulamentul (UE) 2024/1689 (AI Act), cu Regulamentul (UE) 2016/679 (GDPR) și protejarea informațiilor firmei și ale clienților ei.`),
    para("Politica se aplică tuturor angajaților, colaboratorilor și persoanelor care folosesc, în numele firmei, instrumente AI — inclusiv instrumente gratuite sau personale folosite pentru sarcini de serviciu."),
    h1("2. Definiții"),
    bullet([bold("Sistem AI: "), "un sistem bazat pe mașină, conceput să funcționeze cu diferite niveluri de autonomie, care deduce din datele primite cum să genereze rezultate — predicții, conținut, recomandări sau decizii (Art. 3 pct. 1 din AI Act)."]),
    bullet([bold("Instrument aprobat: "), "un sistem AI înscris în registrul sistemelor AI al firmei și aprobat potrivit secțiunii 5."]),
    bullet([bold("Responsabil AI: "), "persoana desemnată la secțiunea 7."]),
    h1("3. Instrumente AI aprobate"),
    approved.length
      ? table([2900, 2200, 2400, PAGE_WIDTH - 7500], ["Instrument", "Furnizor", "Utilizare permisă", "Departament"],
        approved.map((s) => [s.name, s.vendor || "—", s.purpose || fill("utilizare"), s.department || "—"]), { firstColBold: true, size: 18 })
      : para(fill("lista instrumentelor aprobate")),
    para("Orice alt instrument AI poate fi folosit numai după aprobarea prevăzută la secțiunea 5.", { after: 160 }),
    h1("4. Reguli de utilizare"),
    numbered([bold("Date interzise. "), "Nu se introduc în instrumentele AI: date cu caracter personal ale clienților sau angajaților fără un temei legal și fără verificarea condițiilor furnizorului, categorii speciale de date (sănătate, opinii politice, religie etc.), secrete comerciale, parole sau informații confidențiale primite de la terți."], 2),
    numbered([bold("Verificare umană. "), "Rezultatele generate de AI se verifică de o persoană înainte de a fi folosite în relația cu clienții, în documente oficiale sau în decizii care privesc persoane."], 2),
    numbered([bold("Transparență. "), "Persoanele care interacționează cu un chatbot al firmei sunt informate că discută cu un sistem AI. Conținutul generat sau manipulat artificial (imagini, audio, video) publicat de firmă este marcat ca atare (Art. 50 din AI Act)."], 2),
    numbered([bold("Practici interzise. "), "Este interzisă folosirea AI pentru oricare dintre practicile din Art. 5 al AI Act, inclusiv recunoașterea emoțiilor angajaților, scorul social sau manipularea comportamentului."], 2),
    numbered([bold("Decizii despre persoane. "), "Instrumentele AI nu iau singure decizii privind angajarea, evaluarea, promovarea sau concedierea angajaților ori acordarea de servicii clienților. Decizia finală aparține unei persoane cu autoritate."], 2),
    numbered([bold("Proprietate intelectuală. "), "Se respectă drepturile de autor și condițiile de licență ale instrumentelor AI și ale conținutului folosit."], 2),
    h1("5. Aprobarea unui instrument nou"),
    numbered("Solicitantul transmite responsabilului AI: denumirea instrumentului, furnizorul, scopul, datele care vor fi introduse și cine îl va folosi.", 3),
    numbered("Responsabilul AI, împreună cu consultantul juridic, evaluează instrumentul potrivit AI Act și GDPR (inclusiv dacă e necesară o evaluare de impact).", 3),
    numbered("Instrumentul aprobat se înscrie în registrul sistemelor AI, cu încadrarea și condițiile de utilizare.", 3),
    numbered("Utilizatorii sunt instruiți înainte de folosire.", 3),
    h1("6. Instruire"),
    para("Firma ia măsuri pentru a sprijini un nivel suficient de alfabetizare AI a personalului care folosește sisteme AI (Art. 4 din AI Act): instruire inițială la aprobarea unui instrument și reîmprospătare periodică, adaptate rolului fiecăruia. Participarea se documentează."),
    para(["Frecvența instruirii: ", fill("de ex. anual")]),
    h1("7. Responsabilități"),
    factsTable([
      ["Responsabil AI", fill("nume, funcție, contact")],
      ["Consultant juridic", `${ctx.cabinetName}${ctx.responsibleName ? ` — ${ctx.responsibleName}` : ""}`],
      ["Responsabil cu protecția datelor", fill("nume / DPO, dacă există")],
    ]),
    spacer(),
    h1("8. Incidente"),
    para("Orice funcționare neașteptată, rezultat discriminatoriu, scurgere de date sau incident legat de un sistem AI se raportează imediat responsabilului AI. Pentru sistemele cu risc ridicat, firma informează furnizorul și, după caz, autoritatea competentă (Art. 26 alin. (5) din AI Act)."),
    h1("9. Încălcarea politicii"),
    para(["Nerespectarea prezentei politici poate atrage măsuri disciplinare, potrivit regulamentului intern. ", fill("trimitere la regulamentul intern")]),
    h1("10. Revizuire"),
    para(["Politica se revizuiește cel puțin anual și ori de câte ori se modifică legislația sau instrumentele folosite. Intră în vigoare la data de ", fill("data"), "."]),
    spacer(),
    signatureBlock("Aprobat — Administrator", "Avizat — Consultant juridic"),
    spacer(),
    draftNotice(),
  ];
}

// ─── 4. Notificarea angajaților (Art. 26(7)) ─────────────

export function employeeNotice(ctx: DocContext, s: DocSystem): Block[] {
  const uses = s.answers.annexIII.map((c) => labelOf(ANNEX_III_USES, c));
  return [
    ...titleBlock(ctx, "Informare privind utilizarea unui sistem AI la locul de muncă", `${s.name} — potrivit Art. 26 alin. (7) din AI Act`),
    para([bold("Către: "), "angajații ", fill("departamentele / categoriile de angajați vizați"), " și reprezentanții angajaților"]),
    para([bold("De la: "), `${ctx.client.name}`]),
    para([bold("Data: "), fill("data transmiterii — înainte de punerea în funcțiune")]),
    spacer(),
    para([`Vă informăm că ${ctx.client.name} intenționează să folosească, începând cu data de `, fill("data punerii în funcțiune"), `, sistemul de inteligență artificială „${s.name}”${s.vendor ? `, furnizat de ${s.vendor}` : ""}. Potrivit Regulamentului (UE) 2024/1689 privind inteligența artificială, sistemul este considerat cu risc ridicat, iar angajatorul are obligația de a-i informa pe angajați și pe reprezentanții acestora înainte de utilizare.`]),
    h1("1. Ce face sistemul"),
    para(s.description || fill("descrierea sistemului, pe înțelesul angajaților")),
    para([bold("Scop: "), s.purpose || fill("scopul utilizării")]),
    uses.length ? para([bold("Domeniu: "), uses.join("; ")]) : spacer(),
    h1("2. Cum vă privește"),
    para([fill("în ce situații este folosit sistemul (ex. recrutare, alocarea sarcinilor, evaluarea performanței) și ce categorii de angajați sunt vizate")]),
    h1("3. Supraveghere umană"),
    para(["Sistemul nu ia decizii în mod autonom. Rezultatele sunt verificate de ", fill("funcția / persoanele desemnate"), ", care au competența și autoritatea de a le corecta sau de a nu le lua în considerare."]),
    h1("4. Datele prelucrate"),
    para(["Sistemul prelucrează următoarele categorii de date: ", fill("categorii de date"), ". Prelucrarea se face potrivit GDPR; detalii în nota de informare privind prelucrarea datelor personale ", fill("trimitere / anexă"), "."]),
    h1("5. Drepturile dumneavoastră"),
    ...(s.answers.decisionsOnPersons ? [
      bullet("să primiți explicații clare și semnificative despre rolul sistemului într-o decizie care produce efecte juridice sau vă afectează în mod similar (Art. 86 din AI Act);"),
      bullet("dacă o decizie se bazează exclusiv pe prelucrare automată: să cereți intervenție umană, să vă exprimați punctul de vedere și să contestați decizia (Art. 22 GDPR);"),
    ] : []),
    bullet("drepturile prevăzute de GDPR: acces, rectificare, ștergere, opoziție, restricționarea prelucrării."),
    h1("6. Contact"),
    para(["Pentru întrebări: ", fill("persoană de contact, email, telefon"), "."]),
    spacer(),
    signatureBlock("Angajator", "Luat la cunoștință — reprezentantul angajaților"),
    spacer(),
    draftNotice(),
  ];
}

function friaReason(s: DocSystem): string {
  const reasons: string[] = [];
  if (s.answers.publicService) reasons.push("implementatorul este organism de drept public sau entitate privată care prestează servicii publice");
  if (s.answers.annexIII.includes("5b_scoring_credit")) reasons.push("sistemul evaluează bonitatea persoanelor fizice sau stabilește scorul de credit (Anexa III pct. 5 lit. (b))");
  if (s.answers.annexIII.includes("5c_asigurari_viata_sanatate")) reasons.push("sistemul evaluează riscul și stabilește prețul asigurărilor de viață și sănătate (Anexa III pct. 5 lit. (c))");
  const text = reasons.join("; ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}

// ─── 5. Evaluarea impactului asupra drepturilor fundamentale (Art. 27) ─

export function fria(ctx: DocContext, s: DocSystem): Block[] {
  const uses = s.answers.annexIII.map((c) => labelOf(ANNEX_III_USES, c));
  const transparency = s.answers.transparency.map((c) => labelOf(TRANSPARENCY_TRIGGERS, c));
  return [
    ...titleBlock(ctx, "Evaluarea impactului asupra drepturilor fundamentale", `${s.name} — potrivit Art. 27 din AI Act`),
    para("Evaluarea se realizează înainte de prima utilizare a sistemului cu risc ridicat și se actualizează când se schimbă oricare dintre elementele de mai jos. Rezultatele se notifică autorității de supraveghere a pieței (Art. 27 alin. (3))."),
    factsTable([
      ["Implementator", `${ctx.client.name}${ctx.client.cui ? `, CUI ${ctx.client.cui}` : ""}`],
      ["Sistem AI", `${s.name}${s.vendor ? ` — furnizor ${s.vendor}` : ""}`],
      ["Domeniu (Anexa III)", uses.join("; ") || "—"],
      ["Motivul obligației", friaReason(s)],
      ["Prima utilizare preconizată", fill("data")],
    ]),
    spacer(),
    h1("a) Procesele în care se folosește sistemul"),
    para(s.description || fill("descrierea proceselor implementatorului în care sistemul este folosit conform scopului preconizat")),
    para([bold("Scop: "), s.purpose || fill("scop")]),
    para(fill("pașii procesului, cine folosește sistemul, cum sunt folosite rezultatele")),
    h1("b) Perioada și frecvența utilizării"),
    para(fill("perioada de utilizare și frecvența (ex. continuu, la fiecare cerere de credit, lunar)")),
    h1("c) Categoriile de persoane afectate"),
    para(fill("categoriile de persoane fizice și grupurile care pot fi afectate, inclusiv grupuri vulnerabile")),
    h1("d) Riscurile specifice de prejudiciu"),
    para("Se analizează, pentru categoriile de la punctul c), riscurile de prejudiciu, ținând seama de informațiile primite de la furnizor (Art. 13). Puncte de pornire:"),
    table([3200, PAGE_WIDTH - 3200 - 1800, 1800], ["Drept / risc", "Descriere în contextul clientului", "Nivel"], [
      ["Nediscriminare (bias)", [fill("ex. rezultate diferite pe criterii de vârstă, sex, origine")], [fill("scăzut/mediu/ridicat")]],
      ["Protecția datelor și viața privată", [fill("date prelucrate, profilare")], [fill("nivel")]],
      ["Dreptul la o cale de atac", [fill("posibilitatea de a contesta decizia")], [fill("nivel")]],
      ["Acces la servicii esențiale", [fill("efectul unei decizii negative")], [fill("nivel")]],
      ["Alte riscuri", [fill("descriere")], [fill("nivel")]],
    ], { firstColBold: true, size: 18 }),
    spacer(),
    h1("e) Măsurile de supraveghere umană"),
    para(["Potrivit instrucțiunilor de utilizare ale furnizorului: ", fill("persoanele desemnate, competența și autoritatea lor, cum pot interveni sau opri sistemul")]),
    h1("f) Măsuri în cazul materializării riscurilor"),
    para(fill("măsurile de remediere, guvernanța internă și mecanismele de plângere disponibile persoanelor afectate")),
    transparency.length ? para([bold("Obligații de transparență conexe: "), transparency.join("; ")]) : spacer(),
    h1("Concluzie"),
    para(fill("concluzia evaluării: riscurile reziduale sunt acceptabile / se impun măsuri suplimentare")),
    spacer(),
    signatureBlock("Întocmit — Implementator", "Verificat — Consultant juridic"),
    spacer(),
    draftNotice(),
  ];
}
