/**
 * Autoevaluarea gratuită pentru firme (fără cont, fără avocat): întrebările simple din portal,
 * un rezultat ORIENTATIV per instrument și obligațiile generale. Nu e aviz juridic — cazurile
 * cu risc ridicat sau neclare sunt trimise explicit către un avocat.
 */
import { CLIENT_OBLIGATIONS, classifyAiSystem, type ObligationTemplate } from "./aiAct";
import { normalizePortalAnswers, portalToAnswers, type PortalAnswers } from "./portal";

export const JUDETE = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brăila", "Brașov", "București", "Buzău",
  "Călărași", "Caraș-Severin", "Cluj", "Constanța", "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj",
  "Harghita", "Hunedoara", "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți", "Mureș", "Neamț", "Olt", "Prahova",
  "Sălaj", "Satu Mare", "Sibiu", "Suceava", "Teleorman", "Timiș", "Tulcea", "Vâlcea", "Vaslui", "Vrancea",
] as const;
export type Judet = (typeof JUDETE)[number];

/** rezultatul orientativ al unui instrument */
export type SelfVerdict = "minim" | "transparenta" | "risc_ridicat" | "de_verificat";

export const SELF_VERDICT_LABELS: Record<SelfVerdict, string> = {
  minim: "Risc minim",
  transparenta: "Obligații de transparență",
  risc_ridicat: "Risc ridicat",
  de_verificat: "De verificat cu un avocat",
};

export interface SelfTool {
  id: string;
  name: string;
  vendor: string | null;
  purpose: string | null;
  answers: PortalAnswers;
}

export interface SelfToolResult {
  verdict: SelfVerdict;
  /** explicația pe înțelesul firmei */
  summary: string;
  /** de ce e nevoie de un avocat (dacă e cazul) */
  lawyerReason: string | null;
  obligations: Pick<ObligationTemplate, "code" | "article" | "title" | "description" | "appliesFrom">[];
}

export interface SelfToolWithResult extends SelfTool {
  result: SelfToolResult;
}

export interface SelfReport {
  tools: SelfToolWithResult[];
  /** obligațiile generale ale firmei (o singură dată), dacă folosește cel puțin un instrument */
  general: Pick<ObligationTemplate, "code" | "article" | "title" | "description" | "appliesFrom">[];
  /** se recomandă un avocat pentru cel puțin un instrument */
  needsLawyer: boolean;
  counts: Record<SelfVerdict, number>;
}

const pick = (o: ObligationTemplate) => ({ code: o.code, article: o.article, title: o.title, description: o.description, appliesFrom: o.appliesFrom });

export function assessTool(input: Partial<PortalAnswers>): SelfToolResult {
  const p = normalizePortalAnswers(input);
  const c = classifyAiSystem(portalToAnswers(p));
  // biometria poate fi practică interzisă, risc ridicat sau nimic — doar un avocat poate decide
  if (p.biometrics) {
    return {
      verdict: "de_verificat",
      summary: "Instrumentul recunoaște persoane, voci sau emoții. Unele astfel de utilizări sunt interzise din februarie 2025, altele sunt cu risc ridicat, altele nu intră sub incidența regulamentului.",
      lawyerReason: "Recunoașterea biometrică sau a emoțiilor cere o analiză juridică a contextului (Art. 5 și Anexa III pct. 1).",
      obligations: c.obligations.map(pick),
    };
  }
  if (c.riskLevel === "risc_ridicat" || c.riskLevel === "interzis") {
    return {
      verdict: "risc_ridicat",
      summary: "Folosirea instrumentului pentru decizii despre persoane (angajați, candidați, credite sau asigurări) intră în categoria cu risc ridicat. Obligațiile sunt numeroase: supraveghere umană, informarea angajaților, evaluări de impact, păstrarea jurnalelor.",
      lawyerReason: "Sistemele cu risc ridicat au obligații detaliate și excepții care depind de context; vă recomandăm verificarea de către un avocat.",
      obligations: c.obligations.map(pick),
    };
  }
  if (c.riskLevel === "transparenta") {
    return {
      verdict: "transparenta",
      summary: "Persoanele trebuie să știe că interacționează cu un sistem AI sau că un conținut a fost generat ori modificat cu AI.",
      lawyerReason: p.developedInHouse ? "Ați dezvoltat instrumentul: ca furnizor aveți obligații tehnice suplimentare (marcarea conținutului generat)." : null,
      obligations: c.obligations.map(pick),
    };
  }
  return {
    verdict: "minim",
    summary: "Din răspunsuri, instrumentul nu pare să intre într-o categorie cu obligații specifice. Rămân obligațiile generale ale firmei (alfabetizarea AI a personalului).",
    lawyerReason: null,
    obligations: c.obligations.map(pick),
  };
}

export function buildSelfReport(tools: SelfTool[]): SelfReport {
  const rows = tools.map((t) => ({ ...t, result: assessTool(t.answers) }));
  const counts: Record<SelfVerdict, number> = { minim: 0, transparenta: 0, risc_ridicat: 0, de_verificat: 0 };
  for (const r of rows) counts[r.result.verdict]++;
  return {
    tools: rows,
    general: rows.length ? CLIENT_OBLIGATIONS.map(pick) : [],
    needsLawyer: rows.some((r) => r.result.verdict === "risc_ridicat" || r.result.verdict === "de_verificat" || r.result.lawyerReason !== null),
    counts,
  };
}

export const SELF_ASSESSMENT_DISCLAIMER =
  "Rezultatul este o autoevaluare orientativă, generată automat pe baza răspunsurilor dumneavoastră, și nu constituie consultanță juridică. Pentru instrumentele cu risc ridicat sau neclare, ori înainte de a vă baza pe rezultat, consultați un avocat.";
