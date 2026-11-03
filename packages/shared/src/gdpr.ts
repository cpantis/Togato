/**
 * GDPR (Regulamentul (UE) 2016/679) pentru clienții cabinetelor: registrul activităților de prelucrare
 * (Art. 30), cererile persoanelor vizate (Art. 12–22) și incidentele de securitate (Art. 33–34).
 * Funcții pure: aceleași reguli în API și în browser.
 */

export interface GdprOption { code: string; label: string; help?: string }

// ─── Registrul prelucrărilor (Art. 30) ───────────────────

export type ProcessingRole = "operator" | "operator_asociat" | "persoana_imputernicita";
export const PROCESSING_ROLES: { code: ProcessingRole; label: string; help: string }[] = [
  { code: "operator", label: "Operator", help: "Firma stabilește scopul și mijloacele prelucrării (Art. 4 pct. 7)." },
  { code: "operator_asociat", label: "Operator asociat", help: "Scopul și mijloacele se stabilesc împreună cu alt operator (Art. 26) — e nevoie de un acord." },
  { code: "persoana_imputernicita", label: "Persoană împuternicită", help: "Firma prelucrează date în numele altui operator (Art. 28); registrul are conținutul din Art. 30(2)." },
];

export const LEGAL_BASES: GdprOption[] = [
  { code: "6_1_a", label: "Consimțământ — Art. 6(1)(a)", help: "Liber, specific, informat, retras oricând; rar potrivit în relația cu angajații." },
  { code: "6_1_b", label: "Executarea unui contract — Art. 6(1)(b)" },
  { code: "6_1_c", label: "Obligație legală — Art. 6(1)(c)", help: "Indicați actul normativ (ex. Codul muncii, Codul fiscal)." },
  { code: "6_1_d", label: "Interese vitale — Art. 6(1)(d)" },
  { code: "6_1_e", label: "Interes public / autoritate publică — Art. 6(1)(e)" },
  { code: "6_1_f", label: "Interes legitim — Art. 6(1)(f)", help: "Necesită o analiză documentată a interesului legitim (test de echilibru)." },
];

export const DATA_CATEGORIES: (GdprOption & { special?: boolean; sensitive?: boolean })[] = [
  { code: "identificare", label: "Date de identificare (nume, CNP, serie CI)" },
  { code: "contact", label: "Date de contact (adresă, telefon, email)" },
  { code: "financiare", label: "Date financiare (cont bancar, venituri, plăți)" },
  { code: "angajare", label: "Date privind angajarea (funcție, salariu, evaluări)" },
  { code: "educatie", label: "Studii și formare profesională" },
  { code: "online", label: "Identificatori online (IP, cookie-uri, conturi)" },
  { code: "localizare", label: "Date de localizare (GPS, geolocalizare)" },
  { code: "imagine", label: "Imagini și înregistrări video (CCTV)" },
  { code: "comunicari", label: "Conținutul comunicărilor (emailuri, apeluri)" },
  { code: "cazier", label: "Condamnări penale și infracțiuni (Art. 10)", sensitive: true },
  { code: "sanatate", label: "Date privind sănătatea", special: true },
  { code: "biometrice", label: "Date biometrice pentru identificare unică", special: true },
  { code: "genetice", label: "Date genetice", special: true },
  { code: "origine", label: "Origine rasială sau etnică", special: true },
  { code: "opinii", label: "Opinii politice, convingeri religioase sau filozofice", special: true },
  { code: "sindicat", label: "Apartenența la sindicate", special: true },
  { code: "orientare", label: "Viața sexuală sau orientarea sexuală", special: true },
];

export const SUBJECT_CATEGORIES: GdprOption[] = [
  { code: "angajati", label: "Angajați și colaboratori" },
  { code: "candidati", label: "Candidați la angajare" },
  { code: "clienti", label: "Clienți (persoane fizice)" },
  { code: "reprezentanti", label: "Reprezentanți ai clienților / furnizorilor" },
  { code: "vizitatori", label: "Vizitatori (sediu sau site)" },
  { code: "pacienti", label: "Pacienți" },
  { code: "minori", label: "Minori" },
  { code: "public", label: "Publicul larg" },
];

export const SPECIAL_CONDITIONS: GdprOption[] = [
  { code: "9_2_a", label: "Consimțământ explicit — Art. 9(2)(a)" },
  { code: "9_2_b", label: "Obligații în domeniul muncii și protecției sociale — Art. 9(2)(b)" },
  { code: "9_2_c", label: "Interese vitale — Art. 9(2)(c)" },
  { code: "9_2_f", label: "Constatarea, exercitarea sau apărarea unui drept în instanță — Art. 9(2)(f)" },
  { code: "9_2_g", label: "Interes public major — Art. 9(2)(g)" },
  { code: "9_2_h", label: "Medicina muncii, diagnostic, asistență medicală — Art. 9(2)(h)" },
  { code: "9_2_i", label: "Sănătate publică — Art. 9(2)(i)" },
];

export const TRANSFER_MECHANISMS: GdprOption[] = [
  { code: "adecvare", label: "Decizie de adecvare — Art. 45 (ex. SUA prin EU-US Data Privacy Framework, Regatul Unit, Elveția)" },
  { code: "scc", label: "Clauze contractuale standard — Art. 46(2)(c), cu evaluarea impactului transferului" },
  { code: "bcr", label: "Reguli corporatiste obligatorii — Art. 47" },
  { code: "derogare", label: "Derogare pentru situații specifice — Art. 49" },
];

export const SECURITY_MEASURES: GdprOption[] = [
  { code: "acces", label: "Controlul accesului pe roluri și parole puternice / 2FA" },
  { code: "criptare", label: "Criptarea datelor (în tranzit și stocate)" },
  { code: "backup", label: "Copii de siguranță testate" },
  { code: "jurnale", label: "Jurnalizarea accesului la date" },
  { code: "instruire", label: "Instruirea personalului privind protecția datelor" },
  { code: "pseudonimizare", label: "Pseudonimizare / minimizarea datelor" },
  { code: "contracte", label: "Contracte de împuternicire (Art. 28) cu furnizorii" },
  { code: "fizic", label: "Securitatea fizică a documentelor și echipamentelor" },
];

export interface ProcessingInput {
  role: ProcessingRole;
  legalBases: string[];
  specialConditions: string[];
  dataCategories: string[];
  subjectCategories: string[];
  recipients: string | null;
  transferOutsideEea: boolean;
  transferCountries: string | null;
  transferMechanism: string | null;
  retention: string | null;
  securityMeasures: string[];
  /** criterii EDPB (WP248) care cresc riscul — pentru indicația de DPIA */
  largeScale: boolean;
  systematicMonitoring: boolean;
  automatedDecisions: boolean;
  /** prelucrarea folosește un sistem AI din inventar */
  usesAi: boolean;
  /** operațiuni din lista ANSPDCP bifate explicit (vezi ANSPDCP_DPIA_LIST) */
  dpiaListItems?: string[];
}

/**
 * Lista operațiunilor pentru care evaluarea de impact e obligatorie — Decizia ANSPDCP nr. 174/2018,
 * redată parafrazat. De verificat cu textul oficial înainte de a o prezenta ca atare clientului.
 */
export const ANSPDCP_DPIA_LIST: GdprOption[] = [
  { code: "scoring", label: "Evaluarea sau notarea sistematică a persoanelor, inclusiv profilare și predicție, cu efecte juridice sau similare (ex. bonitate, asigurări)" },
  { code: "vulnerabili", label: "Monitorizarea sau înregistrarea sistematică, pe scară largă, a comportamentului persoanelor vulnerabile (în special minori și angajați), inclusiv în scop de marketing" },
  { code: "tehnologii_noi", label: "Utilizarea pe scară largă a unor tehnologii noi sau inovatoare (ex. recunoaștere facială), mai ales când limitează exercitarea drepturilor" },
  { code: "iot", label: "Prelucrarea pe scară largă a datelor generate de dispozitive cu senzori care transmit date prin internet" },
  { code: "localizare", label: "Prelucrarea pe scară largă și/sau sistematică a datelor de trafic sau de localizare" },
  { code: "biometrice", label: "Prelucrarea pe scară largă a datelor biometrice pentru identificarea unică a persoanelor" },
  { code: "genetice", label: "Prelucrarea pe scară largă a datelor genetice" },
];

export interface ProcessingCheck {
  /** probleme de conformitate care trebuie rezolvate */
  issues: string[];
  /** semnale de atenție */
  warnings: string[];
  /** indicație: evaluarea de impact (Art. 35) e probabil necesară (criteriile EDPB) */
  dpiaLikely: boolean;
  dpiaReasons: string[];
  /** evaluarea de impact e obligatorie: Art. 35(3) sau lista ANSPDCP */
  dpiaMandatory: boolean;
  dpiaMandatoryReasons: string[];
}

const label = (list: GdprOption[], code: string) => list.find((o) => o.code === code)?.label ?? code;

/**
 * Verificări de bază pentru o activitate din registru. Indicația de DPIA folosește criteriile EDPB
 * (WP248 rev.01): două sau mai multe criterii → evaluarea e de regulă necesară.
 */
export function checkProcessing(p: ProcessingInput): ProcessingCheck {
  const issues: string[] = [];
  const warnings: string[] = [];
  const special = p.dataCategories.filter((c) => DATA_CATEGORIES.find((d) => d.code === c)?.special);
  if (!p.legalBases.length) issues.push("Lipsește temeiul legal al prelucrării (Art. 6).");
  if (special.length && !p.specialConditions.length) issues.push(`Datele din categorii speciale (${special.map((c) => label(DATA_CATEGORIES, c).toLowerCase()).join(", ")}) cer și o condiție din Art. 9(2).`);
  if (p.transferOutsideEea && !p.transferMechanism) issues.push("Transferul în afara SEE cere un mecanism din Capitolul V (adecvare, clauze standard, BCR sau derogare).");
  if (!p.retention?.trim()) issues.push("Indicați termenul de păstrare sau criteriile de stabilire a lui (Art. 30(1)(f)).");
  if (!p.securityMeasures.length) issues.push("Descrieți măsurile tehnice și organizatorice de securitate (Art. 30(1)(g), Art. 32).");
  if (p.legalBases.includes("6_1_a") && p.subjectCategories.includes("angajati")) warnings.push("Consimțământul angajaților e rareori liber (dezechilibru de putere) — verificați dacă alt temei e mai potrivit.");
  if (p.legalBases.includes("6_1_f")) warnings.push("Păstrați analiza documentată a interesului legitim (test de echilibru).");
  if (p.dataCategories.includes("cazier")) warnings.push("Datele privind condamnările penale pot fi prelucrate doar în condițiile Art. 10 și ale legii naționale.");
  if (p.dataCategories.includes("identificare")) warnings.push("Dacă se prelucrează CNP-ul, respectați condițiile Art. 4 din Legea nr. 190/2018 (garanții, DPO, după caz).");
  if (p.subjectCategories.includes("minori")) warnings.push("Datele minorilor cer protecție sporită (Considerentul 38; Art. 8 pentru servicii online).");
  if (p.role === "persoana_imputernicita") warnings.push("Ca persoană împuternicită, prelucrați doar pe baza instrucțiunilor documentate ale operatorului (Art. 28(3)).");

  const reasons: string[] = [];
  if (special.length || p.dataCategories.includes("cazier")) reasons.push("date sensibile sau din categorii speciale");
  if (p.largeScale) reasons.push("prelucrare la scară largă");
  if (p.systematicMonitoring || p.dataCategories.includes("localizare") || p.dataCategories.includes("imagine")) reasons.push("monitorizare sistematică");
  if (p.automatedDecisions) reasons.push("decizii automate cu efecte juridice sau similare");
  if (p.usesAi) reasons.push("utilizare inovatoare a tehnologiei (sistem AI)");
  if (p.subjectCategories.includes("angajati") || p.subjectCategories.includes("minori") || p.subjectCategories.includes("pacienti")) reasons.push("persoane vulnerabile (angajați, minori, pacienți)");
  if (p.transferOutsideEea) reasons.push("transfer în afara SEE");
  // Art. 35(3) și lista ANSPDCP: evaluarea e obligatorie
  const mandatory: string[] = [];
  const hasCriminal = p.dataCategories.includes("cazier");
  if (p.automatedDecisions) mandatory.push("Art. 35(3)(a): evaluare sistematică și cuprinzătoare, bazată pe prelucrare automată, cu efecte juridice sau similare");
  if (p.largeScale && (special.length || hasCriminal)) mandatory.push("Art. 35(3)(b): categorii speciale de date sau date penale, pe scară largă");
  if (p.largeScale && p.systematicMonitoring && (p.subjectCategories.includes("public") || p.subjectCategories.includes("vizitatori"))) mandatory.push("Art. 35(3)(c): monitorizarea sistematică, pe scară largă, a unei zone accesibile publicului");
  const listItems = new Set(p.dpiaListItems ?? []);
  // deduse din date, pe lângă cele bifate explicit
  if (p.largeScale && p.dataCategories.includes("biometrice")) listItems.add("biometrice");
  if (p.largeScale && p.dataCategories.includes("genetice")) listItems.add("genetice");
  if (p.largeScale && p.dataCategories.includes("localizare")) listItems.add("localizare");
  if (p.largeScale && p.systematicMonitoring && (p.subjectCategories.includes("angajati") || p.subjectCategories.includes("minori"))) listItems.add("vulnerabili");
  for (const code of listItems) {
    const item = ANSPDCP_DPIA_LIST.find((o) => o.code === code);
    if (item) mandatory.push(`Lista ANSPDCP: ${item.label.charAt(0).toLowerCase()}${item.label.slice(1)}`);
  }
  const dpiaMandatory = mandatory.length > 0;
  const dpiaLikely = dpiaMandatory || reasons.length >= 2 || (p.automatedDecisions && special.length > 0);
  return { issues, warnings, dpiaLikely, dpiaReasons: reasons, dpiaMandatory, dpiaMandatoryReasons: mandatory };
}

// ─── Cererile persoanelor vizate (Art. 12–22) ────────────

export type DsarType = "acces" | "rectificare" | "stergere" | "restrictionare" | "portabilitate" | "opozitie" | "decizii_automate";
export const DSAR_TYPES: { code: DsarType; label: string; article: string }[] = [
  { code: "acces", label: "Acces la date", article: "Art. 15" },
  { code: "rectificare", label: "Rectificare", article: "Art. 16" },
  { code: "stergere", label: "Ștergere („dreptul de a fi uitat”)", article: "Art. 17" },
  { code: "restrictionare", label: "Restricționarea prelucrării", article: "Art. 18" },
  { code: "portabilitate", label: "Portabilitatea datelor", article: "Art. 20" },
  { code: "opozitie", label: "Opoziție", article: "Art. 21" },
  { code: "decizii_automate", label: "Decizii individuale automatizate", article: "Art. 22" },
];
export type DsarStatus = "primita" | "in_lucru" | "finalizata" | "respinsa";
export const DSAR_STATUS_LABELS: Record<DsarStatus, string> = { primita: "Primită", in_lucru: "În lucru", finalizata: "Finalizată", respinsa: "Respinsă" };

/** adaugă luni calendaristice; dacă ziua nu există în luna țintă, ultima zi a lunii (31 ian + 1 lună = 28/29 feb) */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** termenul de răspuns: o lună de la primire, prelungit cu încă două luni (Art. 12(3)) */
export function dsarDueDate(receivedOn: string, extended: boolean): string {
  return addMonths(receivedOn, extended ? 3 : 1);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 86400_000);
}

// ─── Incidentele de securitate (Art. 33–34) ──────────────

export type BreachRisk = "neevaluat" | "fara_risc" | "risc" | "risc_ridicat";
export const BREACH_RISK_LABELS: Record<BreachRisk, string> = {
  neevaluat: "Neevaluat",
  fara_risc: "Puțin probabil să genereze un risc",
  risc: "Risc pentru drepturile persoanelor",
  risc_ridicat: "Risc ridicat pentru drepturile persoanelor",
};
export const BREACH_TYPES: GdprOption[] = [
  { code: "confidentialitate", label: "Confidențialitate — divulgare sau acces neautorizat" },
  { code: "integritate", label: "Integritate — modificare neautorizată" },
  { code: "disponibilitate", label: "Disponibilitate — pierdere sau distrugere (ex. ransomware)" },
];

export const BREACH_NOTIFY_HOURS = 72;

/** termenul de notificare a ANSPDCP: 72 de ore de la luarea la cunoștință (Art. 33(1)) */
export function breachDeadline(discoveredAt: string | Date): Date {
  return new Date(new Date(discoveredAt).getTime() + BREACH_NOTIFY_HOURS * 3600_000);
}

export interface BreachDuties {
  notifyAuthority: boolean;
  notifySubjects: boolean;
  summary: string;
}

/** ce trebuie făcut în funcție de evaluarea riscului */
export function breachDuties(risk: BreachRisk): BreachDuties {
  switch (risk) {
    case "fara_risc":
      return { notifyAuthority: false, notifySubjects: false, summary: "Incidentul se documentează în registrul intern (Art. 33(5)), cu motivarea pentru care nu a fost notificat." };
    case "risc":
      return { notifyAuthority: true, notifySubjects: false, summary: "Notificați ANSPDCP în 72 de ore de la luarea la cunoștință (Art. 33). Persoanele vizate nu trebuie informate dacă riscul nu e ridicat." };
    case "risc_ridicat":
      return { notifyAuthority: true, notifySubjects: true, summary: "Notificați ANSPDCP în 72 de ore (Art. 33) și informați fără întârziere nejustificată persoanele vizate (Art. 34), cu excepțiile din Art. 34(3)." };
    default:
      return { notifyAuthority: true, notifySubjects: false, summary: "Evaluați riscul cât mai repede. Până la evaluare, tratați incidentul ca notificabil: termenul de 72 de ore curge de la luarea la cunoștință." };
  }
}

// ─── Evaluarea de impact (DPIA, Art. 35) ─────────────────

export type DpiaLevel = 1 | 2 | 3;
export const DPIA_LIKELIHOOD_LABELS: Record<DpiaLevel, string> = { 1: "Redusă", 2: "Medie", 3: "Ridicată" };
export const DPIA_SEVERITY_LABELS: Record<DpiaLevel, string> = { 1: "Limitată", 2: "Semnificativă", 3: "Gravă" };
export type DpiaRiskLevel = "scazut" | "mediu" | "ridicat";
export const DPIA_RISK_LABELS: Record<DpiaRiskLevel, string> = { scazut: "Scăzut", mediu: "Mediu", ridicat: "Ridicat" };

export interface DpiaRisk {
  id: string;
  title: string;
  description: string;
  likelihood: DpiaLevel;
  severity: DpiaLevel;
  measures: string;
  residualLikelihood: DpiaLevel;
  residualSeverity: DpiaLevel;
}

/** matricea probabilitate × gravitate: 1–2 scăzut, 3–4 mediu, 6–9 ridicat */
export function dpiaRiskLevel(likelihood: DpiaLevel, severity: DpiaLevel): DpiaRiskLevel {
  const score = likelihood * severity;
  return score >= 6 ? "ridicat" : score >= 3 ? "mediu" : "scazut";
}

export type DpiaOutcome = "acceptabil" | "acceptabil_cu_masuri" | "consultare_prealabila";
export const DPIA_OUTCOME_LABELS: Record<DpiaOutcome, string> = {
  acceptabil: "Riscurile reziduale sunt acceptabile",
  acceptabil_cu_masuri: "Acceptabil cu aplicarea măsurilor și reevaluare periodică",
  consultare_prealabila: "Risc rezidual ridicat — consultarea prealabilă a ANSPDCP înainte de începerea prelucrării (Art. 36)",
};

export interface DpiaAssessment {
  outcome: DpiaOutcome;
  /** ce lipsește pentru a putea finaliza evaluarea */
  missing: string[];
  residual: { id: string; inherent: DpiaRiskLevel; residual: DpiaRiskLevel }[];
}

export function assessDpia(d: { necessity: string | null; risks: DpiaRisk[] }): DpiaAssessment {
  const missing: string[] = [];
  if (!d.necessity?.trim()) missing.push("Evaluarea necesității și proporționalității (Art. 35(7)(b)).");
  if (!d.risks.length) missing.push("Identificați cel puțin un risc pentru drepturile și libertățile persoanelor (Art. 35(7)(c)).");
  const residual = d.risks.map((r) => ({ id: r.id, inherent: dpiaRiskLevel(r.likelihood, r.severity), residual: dpiaRiskLevel(r.residualLikelihood, r.residualSeverity) }));
  for (const r of d.risks) {
    if (dpiaRiskLevel(r.likelihood, r.severity) !== "scazut" && !r.measures.trim()) missing.push(`Riscul „${r.title}” nu are măsuri de atenuare (Art. 35(7)(d)).`);
    if (r.residualLikelihood * r.residualSeverity > r.likelihood * r.severity) missing.push(`Riscul rezidual pentru „${r.title}” nu poate fi mai mare decât riscul inițial.`);
  }
  const outcome: DpiaOutcome = residual.some((r) => r.residual === "ridicat") ? "consultare_prealabila" : residual.some((r) => r.residual === "mediu") ? "acceptabil_cu_masuri" : "acceptabil";
  return { outcome, missing, residual };
}

/** riscuri propuse pornind din activitatea din registru — avocatul le ajustează */
export function suggestDpiaRisks(p: ProcessingInput): Omit<DpiaRisk, "id">[] {
  const special = p.dataCategories.some((c) => DATA_CATEGORIES.find((d) => d.code === c)?.special) || p.dataCategories.includes("cazier");
  const sev: DpiaLevel = special ? 3 : 2;
  const risks: Omit<DpiaRisk, "id">[] = [
    { title: "Acces neautorizat sau divulgarea datelor", description: "Persoane neautorizate (interne sau externe) accesează sau copiază datele.", likelihood: 2, severity: sev, measures: "", residualLikelihood: 1, residualSeverity: sev },
    { title: "Pierderea sau indisponibilitatea datelor", description: "Ștergere accidentală, defecțiune, ransomware; persoanele nu își pot exercita drepturile sau sunt afectate de lipsa datelor.", likelihood: 2, severity: 2, measures: "", residualLikelihood: 1, residualSeverity: 2 },
    { title: "Utilizarea în alt scop sau păstrarea excesivă", description: "Datele sunt folosite în scopuri incompatibile cu cel inițial sau păstrate mai mult decât e necesar.", likelihood: 2, severity: 2, measures: "", residualLikelihood: 1, residualSeverity: 2 },
  ];
  if (p.automatedDecisions || p.usesAi) risks.push({ title: "Decizii eronate sau discriminatorii", description: "Rezultatele automate (inclusiv ale sistemelor AI) sunt greșite sau părtinitoare și afectează persoanele, fără o intervenție umană reală.", likelihood: 2, severity: 3, measures: "", residualLikelihood: 1, residualSeverity: 3 });
  if (p.systematicMonitoring) risks.push({ title: "Intruziune în viața privată", description: "Monitorizarea continuă creează un efect de descurajare și depășește așteptările rezonabile ale persoanelor.", likelihood: 3, severity: 2, measures: "", residualLikelihood: 2, residualSeverity: 2 });
  if (p.transferOutsideEea) risks.push({ title: "Acces al autorităților dintr-o țară terță", description: "Datele transferate în afara SEE pot fi accesate de autorități fără garanții echivalente.", likelihood: 2, severity: 2, measures: "", residualLikelihood: 1, residualSeverity: 2 });
  if (p.subjectCategories.includes("angajati") || p.subjectCategories.includes("minori") || p.subjectCategories.includes("pacienti")) risks.push({ title: "Dezechilibru de putere față de persoanele vizate", description: "Angajații, minorii sau pacienții nu se pot opune efectiv prelucrării și nu își exercită drepturile.", likelihood: 2, severity: 2, measures: "", residualLikelihood: 1, residualSeverity: 2 });
  return risks;
}

// ─── Scrisori pentru cererile persoanelor vizate ─────────

export type DsarLetter = "confirmare" | "identitate" | "prelungire" | "raspuns" | "refuz";
export const DSAR_LETTERS: { code: DsarLetter; label: string; help: string }[] = [
  { code: "confirmare", label: "Confirmarea primirii", help: "Trimisă imediat: data primirii și termenul de răspuns." },
  { code: "identitate", label: "Cerere de informații pentru identificare", help: "Art. 12(6): când există îndoieli rezonabile privind identitatea solicitantului." },
  { code: "prelungire", label: "Notificarea prelungirii termenului", help: "Art. 12(3): în prima lună, cu motivele prelungirii." },
  { code: "raspuns", label: "Răspunsul la cerere", help: "Conținutul se adaptează tipului cererii (acces, ștergere, rectificare...)." },
  { code: "refuz", label: "Refuzul motivat", help: "Art. 12(4): motivele și dreptul de a depune plângere la ANSPDCP și de a se adresa instanței." },
];
