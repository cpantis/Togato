/**
 * Catalogul AI Act — Regulamentul (UE) 2024/1689, cu modificările aduse de pachetul
 * „Omnibus digital” privind AI (2026).
 *
 * Tot ce ține de textul legii stă aici: întrebările din chestionar, categoriile de risc,
 * obligațiile și datele de la care se aplică. Clasificarea (`classifyAiSystem`) e o
 * funcție pură — rulează identic în API și în browser (previzualizare live).
 *
 * IMPORTANT: rezultatul e o PROPUNERE pentru avocat, nu o opinie juridică. Avocatul
 * aprobă sau corectează încadrarea în aplicație.
 */

// ─── Date de aplicare ────────────────────────────────────

export const AI_ACT_DATES = {
  /** Art. 4 (alfabetizare AI) și Art. 5 (practici interzise) */
  prohibitedAndLiteracy: "2025-02-02",
  /** Obligațiile pentru modelele AI de uz general (GPAI) */
  gpai: "2025-08-02",
  /** Art. 50 — transparență */
  transparency: "2026-08-02",
  /** Risc ridicat — Anexa III (amânat prin Omnibus) */
  highRiskAnnexIII: "2027-12-02",
  /** Risc ridicat — Anexa I, produse reglementate (amânat prin Omnibus) */
  highRiskAnnexI: "2028-08-02",
} as const;

// ─── Opțiuni chestionar ──────────────────────────────────

export interface Option {
  code: string;
  label: string;
  help?: string;
  article: string;
}

export type RoleAnswer = "implementator" | "furnizor" | "implementator_modificat" | "importator" | "distribuitor";

export const ROLE_OPTIONS: { code: RoleAnswer; label: string; help: string }[] = [
  {
    code: "implementator",
    label: "Folosește un sistem AI dezvoltat de altcineva",
    help: "Ex.: ChatGPT, Copilot, un modul AI dintr-un program de HR cumpărat. Firma e „implementator” (deployer).",
  },
  {
    code: "furnizor",
    label: "A dezvoltat sistemul (sau l-a comandat) și îl folosește ori îl vinde sub numele propriu",
    help: "Firma e „furnizor” (provider) — are cele mai multe obligații.",
  },
  {
    code: "implementator_modificat",
    label: "Folosește sau revinde un sistem terț, dar l-a rebranduit, l-a modificat substanțial sau i-a schimbat scopul",
    help: "Art. 25: pentru sistemele cu risc ridicat, firma preia obligațiile furnizorului.",
  },
  {
    code: "importator",
    label: "Aduce pe piața UE un sistem AI al unui furnizor din afara UE",
    help: "Firma e „importator” (Art. 3 pct. 6). Obligațiile proprii sunt în Art. 23.",
  },
  {
    code: "distribuitor",
    label: "Revinde sau pune la dispoziție un sistem AI, fără să fie furnizorul ori importatorul lui",
    help: "Firma e „distribuitor” (Art. 3 pct. 7), ex. un integrator sau revânzător. Obligațiile proprii sunt în Art. 24.",
  },
];

// ─── Calificare: e sistem de IA? Intră în domeniul de aplicare? ─

export type AiQualification = "da" | "nu" | "neclar";

export const QUALIFICATION_OPTIONS: { code: AiQualification; label: string }[] = [
  { code: "da", label: "Da, este un sistem de IA" },
  { code: "nu", label: "Nu, nu este un sistem de IA" },
  { code: "neclar", label: "Neclar — de verificat" },
];

/** Elementele definiției din Art. 3 pct. 1 — indicii pentru calificare */
export const AI_CRITERIA: Option[] = [
  { code: "masina", article: "Art. 3 pct. 1", label: "Funcționează pe bază de software (un sistem bazat pe o mașină)" },
  { code: "autonomie", article: "Art. 3 pct. 1", label: "Funcționează cu un anumit grad de autonomie față de intervenția umană" },
  { code: "deductie", article: "Art. 3 pct. 1", label: "Deduce din datele primite cum să genereze rezultatele (ex. învățare automată), nu doar aplică reguli fixe definite integral de om" },
  { code: "rezultate", article: "Art. 3 pct. 1", label: "Generează previziuni, conținut, recomandări sau decizii" },
  { code: "influenta", article: "Art. 3 pct. 1", label: "Rezultatele pot influența medii fizice sau virtuale" },
];

/** Art. 2 — situații în care regulamentul nu se aplică */
export const SCOPE_EXCLUSIONS: Option[] = [
  { code: "2_3_aparare", article: "Art. 2(3)", label: "Folosit exclusiv în scopuri militare, de apărare sau de securitate națională" },
  { code: "2_6_cercetare", article: "Art. 2(6)", label: "Dezvoltat și pus în funcțiune special și exclusiv pentru cercetare și dezvoltare științifică" },
  { code: "2_8_dezvoltare", article: "Art. 2(8)", label: "Este încă în cercetare, testare sau dezvoltare, înainte de introducerea pe piață sau punerea în funcțiune (fără testare în condiții reale)" },
  { code: "2_10_personal", article: "Art. 2(10)", label: "Folosit de o persoană fizică într-o activitate strict personală, fără caracter profesional" },
  { code: "2_12_sursa_deschisa", article: "Art. 2(12)", label: "Lansat sub licență liberă și cu sursă deschisă (nu se aplică pentru practici interzise, risc ridicat sau Art. 50)" },
];

/** Art. 5(1) — practici interzise */
export const PROHIBITED_PRACTICES: Option[] = [
  { code: "5a_manipulare", article: "Art. 5(1)(a)", label: "Tehnici subliminale, manipulatoare sau înșelătoare care denaturează comportamentul și pot produce un prejudiciu semnificativ" },
  { code: "5b_vulnerabilitati", article: "Art. 5(1)(b)", label: "Exploatarea vulnerabilităților legate de vârstă, dizabilitate sau situație socio-economică" },
  { code: "5c_scor_social", article: "Art. 5(1)(c)", label: "Evaluarea sau clasificarea persoanelor pe baza comportamentului social ori a trăsăturilor personale („scor social”) cu tratament defavorabil" },
  { code: "5d_predictie_infractiuni", article: "Art. 5(1)(d)", label: "Estimarea riscului ca o persoană să comită o infracțiune exclusiv pe baza profilării sau a trăsăturilor de personalitate" },
  { code: "5e_scraping_faciale", article: "Art. 5(1)(e)", label: "Baze de date de recunoaștere facială create prin extragerea nețintită de imagini faciale de pe internet sau din camere CCTV" },
  { code: "5f_emotii_munca_scoala", article: "Art. 5(1)(f)", label: "Recunoașterea emoțiilor la locul de muncă sau în instituții de învățământ (exceptând motive medicale ori de siguranță)" },
  { code: "5g_categorizare_sensibila", article: "Art. 5(1)(g)", label: "Categorizare biometrică pentru a deduce rasa, opiniile politice, apartenența sindicală, convingerile religioase, viața sexuală sau orientarea sexuală" },
  { code: "5h_identificare_timp_real", article: "Art. 5(1)(h)", label: "Identificare biometrică la distanță, în timp real, în spații publice, în scopul aplicării legii" },
];

/** Anexa III — domenii cu risc ridicat */
export const ANNEX_III_USES: Option[] = [
  { code: "1a_identificare_biometrica", article: "Anexa III pct. 1(a)", label: "Identificare biometrică la distanță (nu simpla verificare a identității, ex. deblocare cu fața)" },
  { code: "1b_categorizare_biometrica", article: "Anexa III pct. 1(b)", label: "Categorizare biometrică după atribute sensibile sau protejate" },
  { code: "1c_recunoastere_emotii", article: "Anexa III pct. 1(c)", label: "Recunoașterea emoțiilor (în afara locului de muncă și a școlii)" },
  { code: "2_infrastructura_critica", article: "Anexa III pct. 2", label: "Componentă de siguranță în infrastructură critică (trafic rutier, apă, gaze, încălzire, electricitate, infrastructură digitală critică)" },
  { code: "3a_admitere_educatie", article: "Anexa III pct. 3(a)", label: "Educație: admitere, acces sau repartizare în instituții de învățământ" },
  { code: "3b_evaluare_invatare", article: "Anexa III pct. 3(b)", label: "Educație: evaluarea rezultatelor învățării" },
  { code: "3c_nivel_educatie", article: "Anexa III pct. 3(c)", label: "Educație: stabilirea nivelului de educație adecvat pentru o persoană" },
  { code: "3d_supraveghere_examene", article: "Anexa III pct. 3(d)", label: "Educație: supravegherea și detectarea comportamentului interzis la examene" },
  { code: "4a_recrutare", article: "Anexa III pct. 4(a)", label: "HR: recrutare și selecție — anunțuri țintite, filtrarea CV-urilor, evaluarea candidaților" },
  { code: "4b_decizii_angajati", article: "Anexa III pct. 4(b)", label: "HR: decizii privind condițiile de muncă, promovarea, concedierea, alocarea sarcinilor sau monitorizarea și evaluarea performanței" },
  { code: "5a_beneficii_publice", article: "Anexa III pct. 5(a)", label: "Eligibilitatea pentru beneficii sau servicii publice de asistență" },
  { code: "5b_scoring_credit", article: "Anexa III pct. 5(b)", label: "Evaluarea bonității sau scoring de credit (exceptând detectarea fraudelor)" },
  { code: "5c_asigurari_viata_sanatate", article: "Anexa III pct. 5(c)", label: "Evaluarea riscului și stabilirea prețului la asigurările de viață și sănătate" },
  { code: "5d_urgente", article: "Anexa III pct. 5(d)", label: "Evaluarea apelurilor de urgență, dispecerizare sau triaj medical de urgență" },
  { code: "6_aplicarea_legii", article: "Anexa III pct. 6", label: "Utilizare de către (sau în numele) autorităților de aplicare a legii" },
  { code: "7_migratie", article: "Anexa III pct. 7", label: "Migrație, azil și controlul la frontieră" },
  { code: "8a_justitie", article: "Anexa III pct. 8(a)", label: "Asistarea unei autorități judiciare (sau a unui organism de soluționare alternativă) în cercetarea și interpretarea faptelor și a legii" },
  { code: "8b_alegeri", article: "Anexa III pct. 8(b)", label: "Influențarea rezultatului unor alegeri sau referendumuri ori a comportamentului de vot" },
];

/** Art. 6(3) — situații în care un sistem din Anexa III NU e considerat cu risc ridicat */
export const DEROGATIONS: Option[] = [
  { code: "6_3a_sarcina_procedurala", article: "Art. 6(3)(a)", label: "Execută doar o sarcină procedurală îngustă" },
  { code: "6_3b_imbunatatire", article: "Art. 6(3)(b)", label: "Îmbunătățește rezultatul unei activități umane deja finalizate" },
  { code: "6_3c_detectare_tipare", article: "Art. 6(3)(c)", label: "Detectează tipare decizionale sau abateri, fără a înlocui ori influența evaluarea umană fără verificare" },
  { code: "6_3d_pregatitoare", article: "Art. 6(3)(d)", label: "Execută doar o sarcină pregătitoare pentru o evaluare din Anexa III" },
];

/** Art. 50 — situații care declanșează obligații de transparență */
export const TRANSPARENCY_TRIGGERS: Option[] = [
  { code: "chatbot", article: "Art. 50(1)", label: "Interacționează direct cu oameni (chatbot, asistent virtual, agent vocal)" },
  { code: "continut_sintetic", article: "Art. 50(2)", label: "Generează conținut sintetic: imagini, audio, video sau text" },
  { code: "emotii_biometric", article: "Art. 50(3)", label: "Recunoaște emoții sau face categorizare biometrică a persoanelor expuse" },
  { code: "deepfake", article: "Art. 50(4)", label: "Produce deepfake-uri (imagini, audio, video care par reale)" },
  { code: "text_interes_public", article: "Art. 50(4)", label: "Publică texte generate cu AI pentru a informa publicul despre chestiuni de interes public" },
];

export interface AiSystemAnswers {
  /** instrumentul îndeplinește definiția sistemului de IA (Art. 3 pct. 1) */
  qualification: AiQualification;
  /** coduri din AI_CRITERIA — indiciile bifate */
  aiCriteria: string[];
  /** coduri din SCOPE_EXCLUSIONS (Art. 2) */
  scopeExclusions: string[];
  role: RoleAnswer;
  /** coduri din PROHIBITED_PRACTICES */
  prohibited: string[];
  /** coduri din ANNEX_III_USES */
  annexIII: string[];
  /** e componentă de siguranță a unui produs reglementat (Anexa I) — mașini, jucării, dispozitive medicale etc. */
  annexI: boolean;
  /** coduri din DEROGATIONS */
  derogations: string[];
  /** face profilarea persoanelor fizice (anulează derogările Art. 6(3)) */
  profiling: boolean;
  /** coduri din TRANSPARENCY_TRIGGERS */
  transparency: string[];
  /** textele publicate trec printr-o revizuire umană / responsabilitate editorială (Art. 50(4)) */
  editorialReview: boolean;
  /** clientul e organism de drept public sau entitate privată care prestează servicii publice (Art. 27) */
  publicService: boolean;
  /** clientul e autoritate publică / instituție a UE (Art. 26(8) — înregistrarea utilizării) */
  publicAuthority: boolean;
  /** sistemul e folosit la locul de muncă și îi privește pe angajați (Art. 26(7)) */
  workplace: boolean;
  /** ia sau asistă decizii despre persoane fizice (Art. 26(11), Art. 86) */
  decisionsOnPersons: boolean;
  /** firma dezvoltă un model AI de uz general (GPAI) */
  gpaiProvider: boolean;
}

export const EMPTY_ANSWERS: AiSystemAnswers = {
  qualification: "neclar",
  aiCriteria: [],
  scopeExclusions: [],
  role: "implementator",
  prohibited: [],
  annexIII: [],
  annexI: false,
  derogations: [],
  profiling: false,
  transparency: [],
  editorialReview: false,
  publicService: false,
  publicAuthority: false,
  workplace: false,
  decisionsOnPersons: false,
  gpaiProvider: false,
};

// ─── Rezultat ────────────────────────────────────────────

export type RiskLevel = "interzis" | "risc_ridicat" | "transparenta" | "minim" | "neaplicabil";
export type LegalRole = "furnizor" | "implementator" | "importator" | "distribuitor";

export const LEGAL_ROLE_LABELS: Record<LegalRole, string> = {
  furnizor: "Furnizor",
  implementator: "Implementator",
  importator: "Importator",
  distribuitor: "Distribuitor",
};

export const RISK_LABELS: Record<RiskLevel | "neclasificat", string> = {
  interzis: "Interzis",
  risc_ridicat: "Risc ridicat",
  transparenta: "Transparență",
  minim: "Risc minim",
  neaplicabil: "În afara AI Act",
  neclasificat: "Neclasificat",
};

export interface ObligationTemplate {
  code: string;
  article: string;
  title: string;
  description: string;
  /** data de la care se aplică (YYYY-MM-DD) */
  appliesFrom: string;
  /** "client" = o singură dată pe client; "system" = pentru fiecare sistem AI */
  scope: "client" | "system";
  /** nu e obligație legală, ci bună practică recomandată */
  recommended?: boolean;
}

export interface Reason {
  text: string;
  article: string;
}

export interface ClassificationResult {
  riskLevel: RiskLevel;
  role: LegalRole;
  highRiskBasis: "anexa_iii" | "anexa_i" | null;
  reasons: Reason[];
  warnings: string[];
  obligations: ObligationTemplate[];
}

// ─── Obligații ───────────────────────────────────────────

const D = AI_ACT_DATES;

/** Obligații la nivel de client — se aplică o dată, dacă firma folosește cel puțin un sistem AI */
export const CLIENT_OBLIGATIONS: ObligationTemplate[] = [
  {
    code: "art4_alfabetizare",
    article: "Art. 4",
    title: "Măsuri de alfabetizare AI pentru personal",
    description:
      "Firma ia măsuri pentru a sprijini un nivel suficient de alfabetizare AI a personalului care folosește sisteme AI (instruire adaptată rolului și contextului). Omnibus-ul a înlocuit obligația de a „asigura” un nivel suficient cu cea de a „sprijini” — păstrați dovezi ale instruirii.",
    appliesFrom: D.prohibitedAndLiteracy,
    scope: "client",
  },
  {
    code: "politica_ai",
    article: "Bună practică",
    title: "Politică internă de utilizare AI și registru al sistemelor",
    description:
      "Politică scrisă: ce instrumente AI sunt permise, ce date nu se introduc în ele, cine aprobă un instrument nou. Registrul sistemelor AI ține evidența inventarului și a încadrării.",
    appliesFrom: D.prohibitedAndLiteracy,
    scope: "client",
    recommended: true,
  },
];

const OBL = {
  art5_verificare: {
    code: "art5_verificare",
    article: "Art. 5",
    title: "Verificarea absenței practicilor interzise",
    description: "Documentați că sistemul nu este folosit pentru niciuna dintre practicile interzise de Art. 5.",
    appliesFrom: D.prohibitedAndLiteracy,
    scope: "system",
  },
  art5_incetare: {
    code: "art5_incetare",
    article: "Art. 5",
    title: "Încetarea imediată a utilizării — practică interzisă",
    description:
      "Utilizarea descrisă intră sub incidența Art. 5. Sistemul trebuie oprit sau reconfigurat. Amenda poate ajunge la 35 mil. € sau 7% din cifra de afaceri mondială (pentru IMM-uri, valoarea mai mică).",
    appliesFrom: D.prohibitedAndLiteracy,
    scope: "system",
  },
  // Transparență — furnizor
  art50_1_furnizor: {
    code: "art50_1_furnizor",
    article: "Art. 50(1)",
    title: "Informarea persoanelor că interacționează cu un sistem AI",
    description: "Sistemul trebuie proiectat astfel încât persoanele să fie informate că interacționează cu AI, cu excepția cazului în care e evident din context.",
    appliesFrom: D.transparency,
    scope: "system",
  },
  art50_2_furnizor: {
    code: "art50_2_furnizor",
    article: "Art. 50(2)",
    title: "Marcarea conținutului sintetic într-un format citibil automat",
    description: "Rezultatele (imagini, audio, video, text) trebuie marcate într-un format citibil automat și detectabile ca generate artificial.",
    appliesFrom: D.transparency,
    scope: "system",
  },
  // Transparență — implementator
  art50_1_verificare: {
    code: "art50_1_verificare",
    article: "Art. 50(1)",
    title: "Verificarea mesajului „vorbiți cu un sistem AI”",
    description: "Obligația aparține furnizorului, dar implementatorul trebuie să verifice că utilizatorii sunt informați efectiv (ex. mesaj vizibil în chatbotul de pe site).",
    appliesFrom: D.transparency,
    scope: "system",
  },
  art50_3: {
    code: "art50_3",
    article: "Art. 50(3)",
    title: "Informarea persoanelor expuse la recunoașterea emoțiilor / categorizare biometrică",
    description: "Persoanele expuse trebuie informate despre funcționarea sistemului; datele personale se prelucrează conform GDPR.",
    appliesFrom: D.transparency,
    scope: "system",
  },
  art50_4_deepfake: {
    code: "art50_4_deepfake",
    article: "Art. 50(4)",
    title: "Dezvăluirea conținutului deepfake",
    description: "Se dezvăluie că imaginea, sunetul sau video-ul a fost generat ori manipulat artificial (regim mai ușor pentru opere evident artistice, satirice sau de ficțiune).",
    appliesFrom: D.transparency,
    scope: "system",
  },
  art50_4_text: {
    code: "art50_4_text",
    article: "Art. 50(4)",
    title: "Dezvăluirea textelor de interes public generate cu AI",
    description: "Textele publicate pentru a informa publicul despre chestiuni de interes public se marchează ca generate cu AI, cu excepția celor revizuite uman sub responsabilitate editorială.",
    appliesFrom: D.transparency,
    scope: "system",
  },
} satisfies Record<string, ObligationTemplate>;

/** Utilizările din Anexa III în afara pct. 2 (infrastructură critică) — relevant pentru Art. 27 și Art. 86 */
const annexIIIExceptPoint2 = (a: AiSystemAnswers) => a.annexIII.some((c) => c !== "2_infrastructura_critica");

/**
 * @param annexIIIHigh sistemul e cu risc ridicat în temeiul Anexei III (nu doar al Anexei I) —
 *   Art. 26(11), Art. 27 și Art. 86 privesc numai sistemele din Anexa III.
 */
function highRiskDeployer(appliesFrom: string, a: AiSystemAnswers, annexIIIHigh: boolean): ObligationTemplate[] {
  const list: ObligationTemplate[] = [
    { code: "art26_1_instructiuni", article: "Art. 26(1)", title: "Utilizare conform instrucțiunilor furnizorului", description: "Măsuri tehnice și organizatorice pentru a folosi sistemul conform instrucțiunilor de utilizare. Obțineți și păstrați instrucțiunile de la furnizor.", appliesFrom, scope: "system" },
    { code: "art26_2_supraveghere", article: "Art. 26(2)", title: "Supraveghere umană de către persoane competente", description: "Desemnați persoanele care supraveghează sistemul — cu competența, instruirea și autoritatea necesare.", appliesFrom, scope: "system" },
    { code: "art26_4_date_intrare", article: "Art. 26(4)", title: "Date de intrare relevante și reprezentative", description: "În măsura în care firma controlează datele de intrare, acestea trebuie să fie relevante și suficient de reprezentative pentru scopul urmărit.", appliesFrom, scope: "system" },
    { code: "art26_5_monitorizare", article: "Art. 26(5)", title: "Monitorizarea funcționării și raportarea riscurilor", description: "Monitorizați funcționarea pe baza instrucțiunilor; informați furnizorul (și, după caz, autoritatea) despre riscuri și incidente grave; suspendați utilizarea dacă e cazul.", appliesFrom, scope: "system" },
    { code: "art26_6_jurnale", article: "Art. 26(6)", title: "Păstrarea jurnalelor (log-urilor) minimum 6 luni", description: "Jurnalele generate automat, aflate sub controlul firmei, se păstrează cel puțin 6 luni (dacă alte norme nu prevăd altfel).", appliesFrom, scope: "system" },
    { code: "art26_9_dpia", article: "Art. 26(9) + GDPR Art. 35", title: "Evaluarea impactului asupra protecției datelor (DPIA)", description: "Folosiți informațiile primite de la furnizor (Art. 13) pentru a realiza DPIA, acolo unde GDPR o cere.", appliesFrom, scope: "system" },
  ];
  if (a.workplace) {
    list.push({ code: "art26_7_angajati", article: "Art. 26(7)", title: "Informarea angajaților și a reprezentanților lor", description: "Înainte de punerea în funcțiune la locul de muncă, angajatorul informează reprezentanții angajaților și angajații afectați.", appliesFrom, scope: "system" });
  }
  if (a.publicAuthority) {
    list.push({ code: "art26_8_inregistrare", article: "Art. 26(8) + Art. 49", title: "Înregistrarea utilizării în baza de date a UE", description: "Autoritățile publice care implementează sisteme cu risc ridicat respectă obligațiile de înregistrare (Art. 49) și nu folosesc un sistem care nu e înregistrat în baza de date a UE; în acest caz informează furnizorul sau distribuitorul.", appliesFrom, scope: "system" });
  }
  // Art. 26(11): numai sistemele din Anexa III care iau sau asistă decizii despre persoane fizice
  if (annexIIIHigh && a.decisionsOnPersons) {
    list.push({ code: "art26_11_informare", article: "Art. 26(11)", title: "Informarea persoanelor vizate de decizii", description: "Persoanele despre care sistemul ia sau asistă decizii sunt informate că fac obiectul utilizării unui sistem AI cu risc ridicat.", appliesFrom, scope: "system" });
  }
  // Art. 86: numai Anexa III, cu excepția pct. 2 (infrastructură critică)
  if (annexIIIHigh && a.decisionsOnPersons && annexIIIExceptPoint2(a)) {
    list.push({ code: "art86_explicatie", article: "Art. 86", title: "Procedură pentru dreptul la explicație", description: "Persoana afectată de o decizie cu efecte juridice sau similare poate cere explicații clare despre rolul sistemului AI. Pregătiți un răspuns-tip și un responsabil.", appliesFrom, scope: "system" });
  }
  // Art. 27: organisme publice / servicii publice (Anexa III, fără pct. 2) și Anexa III pct. 5 lit. (b) și (c)
  const friaUses = a.annexIII.some((c) => c === "5b_scoring_credit" || c === "5c_asigurari_viata_sanatate");
  if (annexIIIHigh && ((a.publicService && annexIIIExceptPoint2(a)) || friaUses)) {
    list.push({ code: "art27_fria", article: "Art. 27", title: "Evaluarea impactului asupra drepturilor fundamentale (FRIA)", description: "Înainte de prima utilizare: procese în care se folosește, perioada, categoriile de persoane afectate, riscurile, măsurile de supraveghere umană și de remediere. Rezultatul se notifică autorității de supraveghere.", appliesFrom, scope: "system" });
  }
  return list;
}

function highRiskImporter(appliesFrom: string): ObligationTemplate[] {
  const o = (code: string, article: string, title: string, description: string): ObligationTemplate => ({ code, article, title, description, appliesFrom, scope: "system" });
  return [
    o("art23_1_verificare", "Art. 23(1)", "Verificarea conformității înainte de introducerea pe piață", "Verificați că furnizorul a efectuat evaluarea conformității (Art. 43), a întocmit documentația tehnică (Art. 11, Anexa IV), sistemul poartă marcajul CE și e însoțit de declarația de conformitate (Art. 47) și de instrucțiuni, iar furnizorul și-a desemnat un reprezentant autorizat (Art. 22)."),
    o("art23_2_neconformitate", "Art. 23(2)", "Neintroducerea pe piață a unui sistem neconform", "Dacă sistemul nu e conform sau documentația e falsificată, nu se introduce pe piață până la aducerea în conformitate; dacă prezintă un risc, se informează furnizorul, reprezentantul autorizat și autoritățile."),
    o("art23_3_identificare", "Art. 23(3)", "Indicarea numelui și a datelor de contact ale importatorului", "Numele, denumirea comercială sau marca și adresa de contact apar pe ambalaj sau în documentele care însoțesc sistemul."),
    o("art23_4_depozitare", "Art. 23(4)", "Condiții de depozitare și transport", "Cât timp sistemul e în responsabilitatea importatorului, depozitarea și transportul nu îi periclitează conformitatea."),
    o("art23_5_pastrare", "Art. 23(5)", "Păstrarea documentelor 10 ani", "Copia certificatului organismului notificat (după caz), a instrucțiunilor de utilizare și a declarației de conformitate UE se păstrează 10 ani."),
    o("art23_6_cooperare", "Art. 23(6)", "Informarea și cooperarea cu autoritățile", "La cerere motivată, importatorul furnizează autorităților informațiile și documentația care dovedesc conformitatea și cooperează la măsurile luate (Art. 23(6)–(7))."),
  ];
}

function highRiskDistributor(appliesFrom: string): ObligationTemplate[] {
  const o = (code: string, article: string, title: string, description: string): ObligationTemplate => ({ code, article, title, description, appliesFrom, scope: "system" });
  return [
    o("art24_1_verificare", "Art. 24(1)", "Verificarea marcajului CE și a documentelor", "Înainte de punerea la dispoziție, verificați marcajul CE, declarația de conformitate UE (Art. 47), instrucțiunile de utilizare și faptul că furnizorul și importatorul și-au respectat obligațiile."),
    o("art24_2_neconformitate", "Art. 24(2)", "Nepunerea la dispoziție a unui sistem neconform", "Dacă există motive să considerați că sistemul nu e conform, nu îl puneți la dispoziție până la aducerea în conformitate; dacă prezintă un risc, informați furnizorul sau importatorul."),
    o("art24_3_depozitare", "Art. 24(3)", "Condiții de depozitare și transport", "Cât timp sistemul e în responsabilitatea distribuitorului, depozitarea și transportul nu îi periclitează conformitatea."),
    o("art24_4_corective", "Art. 24(4)", "Măsuri corective pentru sisteme neconforme", "Pentru un sistem deja pus la dispoziție și neconform: aducerea în conformitate, retragerea sau rechemarea, ori asigurarea că furnizorul sau importatorul le ia; informarea autorităților dacă prezintă un risc."),
    o("art24_5_cooperare", "Art. 24(5)", "Informarea și cooperarea cu autoritățile", "La cerere motivată, distribuitorul furnizează informațiile și documentația despre acțiunile sale și cooperează la măsurile luate (Art. 24(5)–(6))."),
  ];
}

function highRiskProvider(appliesFrom: string): ObligationTemplate[] {
  const o = (code: string, article: string, title: string, description: string): ObligationTemplate => ({ code, article, title, description, appliesFrom, scope: "system" });
  return [
    o("art9_riscuri", "Art. 9", "Sistem de management al riscurilor", "Proces continuu de identificare, evaluare și reducere a riscurilor pe tot ciclul de viață."),
    o("art10_date", "Art. 10", "Guvernanța datelor de antrenare, validare și testare", "Date relevante, reprezentative, verificate pentru erori și prejudecăți (bias)."),
    o("art11_documentatie", "Art. 11 + Anexa IV", "Documentație tehnică", "Documentația tehnică întocmită înainte de introducerea pe piață și ținută la zi."),
    o("art12_jurnale", "Art. 12", "Înregistrarea automată a evenimentelor (logging)", "Sistemul permite tehnic înregistrarea automată a evenimentelor pe durata de viață."),
    o("art13_instructiuni", "Art. 13", "Transparență față de implementatori — instrucțiuni de utilizare", "Instrucțiuni clare: scop, performanță, limitări, supraveghere umană, întreținere."),
    o("art14_supraveghere", "Art. 14", "Proiectare pentru supraveghere umană", "Sistemul permite supravegherea eficientă de către oameni, inclusiv oprirea."),
    o("art15_robustete", "Art. 15", "Acuratețe, robustețe și securitate cibernetică", "Niveluri adecvate de acuratețe, rezistență la erori și la atacuri."),
    o("art17_calitate", "Art. 17", "Sistem de management al calității", "Politici, proceduri și instrucțiuni scrise care asigură conformitatea."),
    o("art18_pastrare", "Art. 18", "Păstrarea documentației 10 ani", "Documentația tehnică, a calității și declarația de conformitate se păstrează 10 ani."),
    o("art43_conformitate", "Art. 43", "Evaluarea conformității", "Procedura de evaluare a conformității înainte de introducerea pe piață."),
    o("art47_declaratie", "Art. 47", "Declarația UE de conformitate", "Declarație scrisă, semnată, pentru fiecare sistem."),
    o("art48_ce", "Art. 48", "Marcajul CE", "Aplicarea marcajului CE vizibil, lizibil și indelebil (sau digital)."),
    o("art49_inregistrare", "Art. 49", "Înregistrarea în baza de date a UE", "Furnizorul își înregistrează sistemul înainte de introducerea pe piață."),
    o("art72_post_piata", "Art. 72", "Monitorizare ulterioară introducerii pe piață", "Plan de monitorizare post-piață, proporțional cu riscurile."),
    o("art73_incidente", "Art. 73", "Raportarea incidentelor grave", "Incidentele grave se raportează autorității de supraveghere în termenele legale."),
  ];
}

// ─── Clasificare ─────────────────────────────────────────

function byCode(list: Option[], code: string): Option | undefined {
  return list.find((o) => o.code === code);
}

/** Normalizează răspunsuri parțiale / vechi la forma completă. */
export function normalizeAnswers(input: Partial<AiSystemAnswers> | null | undefined): AiSystemAnswers {
  const a = { ...EMPTY_ANSWERS, ...(input || {}) };
  const keep = (codes: unknown, list: Option[]) =>
    Array.isArray(codes) ? codes.filter((c): c is string => typeof c === "string" && list.some((o) => o.code === c)) : [];
  return {
    ...a,
    qualification: QUALIFICATION_OPTIONS.some((q) => q.code === a.qualification) ? a.qualification : "neclar",
    aiCriteria: keep(a.aiCriteria, AI_CRITERIA),
    scopeExclusions: keep(a.scopeExclusions, SCOPE_EXCLUSIONS),
    role: ROLE_OPTIONS.some((r) => r.code === a.role) ? a.role : "implementator",
    prohibited: keep(a.prohibited, PROHIBITED_PRACTICES),
    annexIII: keep(a.annexIII, ANNEX_III_USES),
    derogations: keep(a.derogations, DEROGATIONS),
    transparency: keep(a.transparency, TRANSPARENCY_TRIGGERS),
    annexI: !!a.annexI,
    profiling: !!a.profiling,
    editorialReview: !!a.editorialReview,
    publicService: !!a.publicService,
    publicAuthority: !!a.publicAuthority,
    workplace: !!a.workplace,
    decisionsOnPersons: !!a.decisionsOnPersons,
    gpaiProvider: !!a.gpaiProvider,
  };
}

export function classifyAiSystem(input: Partial<AiSystemAnswers>): ClassificationResult {
  const a = normalizeAnswers(input);
  const reasons: Reason[] = [];
  const warnings: string[] = [];
  const obligations: ObligationTemplate[] = [];
  const baseRole: LegalRole = a.role === "importator" || a.role === "distribuitor" ? a.role : a.role === "furnizor" ? "furnizor" : "implementator";
  const providerLike = a.role === "furnizor" || a.role === "implementator_modificat";

  // 0. Calificare (Art. 3 pct. 1) și domeniul de aplicare (Art. 2)
  const outOfScope = (why: Reason[], warn: string[]): ClassificationResult => ({
    riskLevel: "neaplicabil", role: baseRole, highRiskBasis: null, reasons: why, warnings: warn, obligations: [],
  });
  if (a.qualification === "nu") {
    return outOfScope(
      [{ text: "Instrumentul nu îndeplinește definiția sistemului de IA", article: "Art. 3 pct. 1" }],
      ["Documentați motivele calificării (ex. funcționează doar pe reguli fixe definite integral de om). Reevaluați dacă instrumentul se schimbă."],
    );
  }
  const hardExclusions = a.scopeExclusions.filter((c) => c !== "2_12_sursa_deschisa");
  if (hardExclusions.length) {
    return outOfScope(
      hardExclusions.map((c) => { const e = byCode(SCOPE_EXCLUSIONS, c)!; return { text: e.label, article: e.article }; }),
      ["Excluderea din domeniul de aplicare trebuie documentată. Reevaluați la orice schimbare a utilizării (ex. trecerea din dezvoltare în producție)."],
    );
  }
  if (a.qualification === "neclar") {
    warnings.push("Calificarea ca sistem de IA (Art. 3 pct. 1) nu a fost confirmată. Încadrarea pornește de la ipoteza că instrumentul este un sistem de IA.");
  }

  // 1. Practici interzise — au prioritate
  if (a.prohibited.length > 0) {
    for (const code of a.prohibited) {
      const p = byCode(PROHIBITED_PRACTICES, code)!;
      reasons.push({ text: p.label, article: p.article });
    }
    obligations.push(OBL.art5_incetare);
    return {
      riskLevel: "interzis",
      role: providerLike ? "furnizor" : baseRole,
      highRiskBasis: null,
      reasons,
      warnings: [...warnings, "Practicile interzise se aplică din 2 februarie 2025. Recomandați clientului oprirea imediată a utilizării."],
      obligations,
    };
  }
  obligations.push(OBL.art5_verificare);

  // 2. Risc ridicat — Anexa I sau Anexa III (cu derogările Art. 6(3))
  let highRiskBasis: ClassificationResult["highRiskBasis"] = null;
  let annexIIIHigh = false;
  if (a.annexI) {
    reasons.push({ text: "Componentă de siguranță a unui produs reglementat de legislația de armonizare a UE", article: "Art. 6(1) + Anexa I" });
  }
  if (a.annexIII.length > 0) {
    const uses = a.annexIII.map((c) => byCode(ANNEX_III_USES, c)!);
    const derogated = a.derogations.length > 0 && !a.profiling;
    if (derogated) {
      for (const c of a.derogations) {
        const d = byCode(DEROGATIONS, c)!;
        reasons.push({ text: `Domeniu din Anexa III, dar se aplică derogarea: ${d.label.toLowerCase()}`, article: d.article });
      }
      warnings.push(
        !providerLike
          ? "Derogarea Art. 6(3) o stabilește furnizorul. Cereți furnizorului evaluarea documentată (Art. 6(4)) și verificați înregistrarea în baza de date a UE."
          : "Derogarea Art. 6(3) trebuie documentată înainte de introducerea pe piață (Art. 6(4)), iar sistemul se înregistrează în baza de date a UE (Art. 49(2)).",
      );
    } else {
      annexIIIHigh = true;
      for (const u of uses) reasons.push({ text: u.label, article: u.article });
      if (a.derogations.length > 0 && a.profiling) {
        reasons.push({ text: "Derogările nu se aplică: sistemul face profilarea persoanelor fizice", article: "Art. 6(3) ultimul paragraf" });
      }
    }
    if (derogated && providerLike) {
      obligations.push(
        { code: "art6_4_evaluare", article: "Art. 6(4)", title: "Documentarea evaluării că sistemul nu e cu risc ridicat", description: "Evaluarea se documentează înainte de introducerea pe piață și se pune la dispoziția autorității, la cerere.", appliesFrom: D.highRiskAnnexIII, scope: "system" },
        { code: "art49_2_inregistrare", article: "Art. 49(2)", title: "Înregistrarea în baza de date a UE (sistem derogat)", description: "Și sistemele din Anexa III considerate fără risc ridicat se înregistrează de furnizor.", appliesFrom: D.highRiskAnnexIII, scope: "system" },
      );
    }
  }

  // Anexa III are prioritate: are obligații suplimentare și se aplică mai devreme decât Anexa I
  highRiskBasis = annexIIIHigh ? "anexa_iii" : a.annexI ? "anexa_i" : null;
  if (annexIIIHigh && a.annexI) {
    warnings.push("Sistemul e și componentă de siguranță a unui produs reglementat (Anexa I). Obligațiile afișate urmează termenul Anexei III; cerințele legate de produs (Anexa I) se aplică din 2 august 2028 și se verifică separat.");
  }

  // Rolul juridic: Art. 25 — implementatorul care rebranduiește / modifică devine furnizor pentru risc ridicat
  let role: LegalRole = baseRole;
  if (a.role === "implementator_modificat") {
    if (highRiskBasis) {
      role = "furnizor";
      reasons.push({ text: "Sistem terț rebranduit, modificat substanțial sau cu scop schimbat — firma preia obligațiile furnizorului", article: "Art. 25(1)" });
    } else {
      warnings.push("Dacă modificările fac sistemul să devină cu risc ridicat (Art. 25(1)(c)), firma devine furnizor. Reevaluați la orice schimbare de scop.");
    }
  }

  if (highRiskBasis) {
    const appliesFrom = highRiskBasis === "anexa_i" ? D.highRiskAnnexI : D.highRiskAnnexIII;
    obligations.push(...(
      role === "furnizor" ? highRiskProvider(appliesFrom)
        : role === "importator" ? highRiskImporter(appliesFrom)
          : role === "distribuitor" ? highRiskDistributor(appliesFrom)
            : highRiskDeployer(appliesFrom, a, annexIIIHigh)
    ));
    if (role === "importator" || role === "distribuitor") {
      warnings.push(`Dacă firma folosește ea însăși sistemul, are și obligațiile implementatorului (Art. 26). Dacă îl rebranduiește sau îl modifică substanțial, devine furnizor (Art. 25).`);
    }
    if (role === "furnizor" && a.decisionsOnPersons) {
      warnings.push("Ca furnizor, firma poate fi și implementator, dacă folosește ea însăși sistemul — verificați și obligațiile din Art. 26.");
    }
  }

  // 3. Transparență — se cumulează cu risc ridicat; privește furnizorii și implementatorii
  const tr = new Set(role === "importator" || role === "distribuitor" ? [] : a.transparency);
  if ((role === "importator" || role === "distribuitor") && a.transparency.length) {
    warnings.push("Obligațiile de transparență (Art. 50) revin furnizorului și implementatorului. Verificați că sistemul pus la dispoziție permite respectarea lor.");
  }
  if (tr.has("chatbot")) obligations.push(role === "furnizor" ? OBL.art50_1_furnizor : OBL.art50_1_verificare);
  if (tr.has("continut_sintetic") && role === "furnizor") obligations.push(OBL.art50_2_furnizor);
  if (tr.has("emotii_biometric")) obligations.push(OBL.art50_3);
  if (tr.has("deepfake")) obligations.push(OBL.art50_4_deepfake);
  if (tr.has("text_interes_public") && !a.editorialReview) obligations.push(OBL.art50_4_text);
  if (tr.has("text_interes_public") && a.editorialReview) {
    warnings.push("Excepția de la Art. 50(4) pentru texte revizuite uman cere o responsabilitate editorială reală — documentați fluxul de revizuire.");
  }
  if (tr.has("continut_sintetic") && role === "implementator") {
    warnings.push("Marcarea conținutului sintetic (Art. 50(2)) e obligația furnizorului — verificați că instrumentul folosit o face.");
  }
  for (const code of a.transparency) {
    const t = byCode(TRANSPARENCY_TRIGGERS, code)!;
    if (!highRiskBasis) reasons.push({ text: t.label, article: t.article });
  }

  // 4. GPAI
  if (a.gpaiProvider) {
    obligations.push({ code: "art53_gpai", article: "Art. 53", title: "Obligațiile furnizorilor de modele AI de uz general", description: "Documentație tehnică a modelului, informații pentru integratori, politică privind drepturile de autor, rezumat public al datelor de antrenare. Cazul cere analiză de specialitate.", appliesFrom: D.gpai, scope: "system" });
    warnings.push("Furnizorii de modele de uz general au un regim separat (Capitolul V). Cazul depășește chestionarul — necesită analiză dedicată.");
  }

  // Art. 2(12): sursa deschisă e exclusă doar dacă nu e practică interzisă, risc ridicat sau situație din Art. 50
  if (a.scopeExclusions.includes("2_12_sursa_deschisa")) {
    if (!highRiskBasis && a.transparency.length === 0) {
      return outOfScope([{ text: byCode(SCOPE_EXCLUSIONS, "2_12_sursa_deschisa")!.label, article: "Art. 2(12)" }], warnings);
    }
    warnings.push("Excepția pentru licențe libere și cu sursă deschisă (Art. 2(12)) nu se aplică: sistemul e cu risc ridicat sau intră sub incidența Art. 50.");
  }

  const riskLevel: RiskLevel = highRiskBasis ? "risc_ridicat" : a.transparency.length > 0 ? "transparenta" : "minim";
  if (riskLevel === "minim") {
    reasons.push({ text: "Nicio practică interzisă, niciun domeniu cu risc ridicat, nicio situație de transparență", article: "—" });
  }

  return { riskLevel, role, highRiskBasis, reasons, warnings, obligations };
}

// ─── Stări obligații ─────────────────────────────────────

export type ObligationStatus = "de_facut" | "in_lucru" | "indeplinit" | "nu_se_aplica";

export const OBLIGATION_STATUS_LABELS: Record<ObligationStatus, string> = {
  de_facut: "De făcut",
  in_lucru: "În lucru",
  indeplinit: "Îndeplinit",
  nu_se_aplica: "Nu se aplică",
};

export type ReviewStatus = "propus" | "aprobat" | "respins";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  propus: "De verificat",
  aprobat: "Aprobat de avocat",
  respins: "Respins — de reanalizat",
};
