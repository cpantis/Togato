/**
 * Portalul clientului: întrebări pe înțelesul unei firme, fără limbaj juridic.
 * Răspunsurile se transformă într-un set inițial de răspunsuri la chestionarul AI Act;
 * avocatul verifică și completează încadrarea.
 */
import { EMPTY_ANSWERS, type AiSystemAnswers } from "./aiAct";

export interface PortalAnswers {
  /** firma a dezvoltat instrumentul (sau l-a comandat) */
  developedInHouse: boolean;
  /** clienții sau publicul discută direct cu instrumentul (chatbot, asistent vocal) */
  talksToPeople: boolean;
  /** generează texte, imagini, audio sau video pe care firma le publică */
  generatesContent: boolean;
  /** folosit în recrutare: anunțuri, filtrarea CV-urilor, evaluarea candidaților */
  recruitment: boolean;
  /** folosit pentru a evalua, monitoriza, promova sau concedia angajați ori a le aloca sarcini */
  employeeManagement: boolean;
  /** decide sau influențează acordarea de credite ori calculează un scor de bonitate */
  creditScoring: boolean;
  /** stabilește prețul sau riscul la asigurări de viață ori de sănătate */
  lifeHealthInsurance: boolean;
  /** recunoaște fețe, voci, emoții sau alte trăsături biometrice */
  biometrics: boolean;
  /** rezultatele influențează decizii despre persoane (angajați, clienți) */
  decisionsAboutPeople: boolean;
  /** observații libere ale clientului */
  notes?: string;
}

export const EMPTY_PORTAL_ANSWERS: PortalAnswers = {
  developedInHouse: false,
  talksToPeople: false,
  generatesContent: false,
  recruitment: false,
  employeeManagement: false,
  creditScoring: false,
  lifeHealthInsurance: false,
  biometrics: false,
  decisionsAboutPeople: false,
  notes: "",
};

export const PORTAL_QUESTIONS: { key: Exclude<keyof PortalAnswers, "notes">; label: string; help?: string }[] = [
  { key: "developedInHouse", label: "Ați dezvoltat instrumentul în firmă sau l-ați comandat special pentru voi?", help: "Răspundeți „Nu” dacă îl cumpărați sau îl folosiți de la un furnizor (ex. ChatGPT, un program HR)." },
  { key: "talksToPeople", label: "Clienții sau publicul discută direct cu acest instrument?", help: "De exemplu un chatbot pe site, un asistent pe WhatsApp sau un robot telefonic." },
  { key: "generatesContent", label: "Generează texte, imagini, sunete sau video pe care le publicați?" },
  { key: "recruitment", label: "Îl folosiți la recrutare?", help: "Anunțuri de angajare țintite, filtrarea CV-urilor, evaluarea candidaților." },
  { key: "employeeManagement", label: "Îl folosiți pentru angajați: evaluare, monitorizare, promovare, concediere sau împărțirea sarcinilor?" },
  { key: "creditScoring", label: "Decide sau influențează acordarea unui credit ori calculează un scor de bonitate pentru persoane?" },
  { key: "lifeHealthInsurance", label: "Stabilește prețul sau riscul pentru asigurări de viață ori de sănătate?" },
  { key: "biometrics", label: "Recunoaște fețe, voci, emoții sau alte trăsături ale persoanelor?" },
  { key: "decisionsAboutPeople", label: "Rezultatele lui influențează decizii despre persoane (angajați, candidați, clienți)?" },
];

export function normalizePortalAnswers(input: Partial<PortalAnswers> | null | undefined): PortalAnswers {
  const a = { ...EMPTY_PORTAL_ANSWERS, ...(input || {}) };
  const out = { ...EMPTY_PORTAL_ANSWERS };
  for (const q of PORTAL_QUESTIONS) out[q.key] = a[q.key] === true;
  out.notes = typeof a.notes === "string" ? a.notes.slice(0, 2000) : "";
  return out;
}

/**
 * Transformă răspunsurile din portal într-un punct de plecare pentru chestionarul AI Act.
 * Biometria NU se mapează automat (poate fi practică interzisă, risc ridicat sau nimic) —
 * rămâne în răspunsurile brute, iar avocatul decide.
 */
export function portalToAnswers(input: Partial<PortalAnswers>): AiSystemAnswers {
  const p = normalizePortalAnswers(input);
  const annexIII: string[] = [];
  if (p.recruitment) annexIII.push("4a_recrutare");
  if (p.employeeManagement) annexIII.push("4b_decizii_angajati");
  if (p.creditScoring) annexIII.push("5b_scoring_credit");
  if (p.lifeHealthInsurance) annexIII.push("5c_asigurari_viata_sanatate");
  const transparency: string[] = [];
  if (p.talksToPeople) transparency.push("chatbot");
  if (p.generatesContent) transparency.push("continut_sintetic");
  return {
    ...EMPTY_ANSWERS,
    role: p.developedInHouse ? "furnizor" : "implementator",
    annexIII,
    transparency,
    workplace: p.recruitment || p.employeeManagement,
    decisionsOnPersons: p.decisionsAboutPeople || p.recruitment || p.employeeManagement || p.creditScoring || p.lifeHealthInsurance,
  };
}

/** Răspunsurile care cer atenția avocatului dincolo de maparea automată */
export function portalFlags(input: Partial<PortalAnswers>): string[] {
  const p = normalizePortalAnswers(input);
  const flags: string[] = [];
  if (p.biometrics) flags.push("Clientul a indicat recunoaștere biometrică / a emoțiilor — verificați Art. 5(1)(f)–(h) și Anexa III pct. 1.");
  if (p.notes) flags.push("Clientul a lăsat observații.");
  return flags;
}
