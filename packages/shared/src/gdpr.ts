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
}

export interface ProcessingCheck {
  /** probleme de conformitate care trebuie rezolvate */
  issues: string[];
  /** semnale de atenție */
  warnings: string[];
  /** indicație: evaluarea de impact (Art. 35) e probabil necesară */
  dpiaLikely: boolean;
  dpiaReasons: string[];
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
  const dpiaLikely = reasons.length >= 2 || (p.automatedDecisions && special.length > 0);
  return { issues, warnings, dpiaLikely, dpiaReasons: reasons };
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
