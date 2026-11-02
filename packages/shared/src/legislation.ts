/**
 * Versiunile regulilor AI Act din Togato și reîncadrarea după o modificare legislativă.
 *
 * Procedura la o schimbare de lege:
 *  1. se modifică regulile în `aiAct.ts` (+ teste);
 *  2. se adaugă o intrare la ÎNCEPUTUL lui `RULESET_CHANGELOG`, cu o versiune nouă;
 *  3. la pornire, API-ul reîncadrează toate sistemele salvate pe o versiune mai veche
 *     (`planReclassification`): schimbările minore se aplică direct, cele de fond trimit
 *     sistemul înapoi la verificarea avocatului.
 */
import { RISK_LABELS, classifyAiSystem, type AiSystemAnswers, type ClassificationResult, type ObligationTemplate, type RiskLevel } from "./aiAct";

export interface RulesetChange {
  /** format AAAA.N */
  version: string;
  /** data publicării versiunii în Togato (AAAA-LL-ZZ) */
  date: string;
  title: string;
  summary: string;
  /** sursa juridică a modificării */
  source: string;
  articles: string[];
}

/** Cea mai nouă versiune e prima. */
export const RULESET_CHANGELOG: RulesetChange[] = [
  {
    version: "2026.2",
    date: "2026-11-02",
    title: "Corectură Art. 26(8): înregistrarea se cere doar autorităților publice",
    summary:
      "Verificare față de textul oficial: obligația de înregistrare a utilizării unui sistem cu risc ridicat (Art. 26(8) + Art. 49) privește autoritățile publice și instituțiile UE, nu și entitățile private care prestează servicii publice (acestea rămân vizate de evaluarea de impact din Art. 27). Chestionarul are o întrebare nouă: „Clientul este autoritate publică?”. Sistemele unde obligația a fost eliminată revin la verificare; dacă clientul e autoritate publică, bifați întrebarea nouă.",
    source: "Regulamentul (UE) 2024/1689, Art. 26 alin. (8) și Art. 27 alin. (1) — textul oficial în limba română",
    articles: ["Art. 26(8)", "Art. 27", "Art. 49"],
  },
  {
    version: "2026.1",
    date: "2026-11-02",
    title: "AI Act după pachetul Omnibus digital",
    summary:
      "Regulile de bază: practicile interzise (Art. 5) și alfabetizarea AI (Art. 4, formularea „sprijină”) din 2 februarie 2025; transparența (Art. 50) din 2 august 2026; risc ridicat — Anexa III din 2 decembrie 2027 și Anexa I din 2 august 2028, potrivit amânării prin Omnibus.",
    source: "Regulamentul (UE) 2024/1689, cu modificările aduse de pachetul Omnibus digital privind AI (2026)",
    articles: ["Art. 4", "Art. 5", "Art. 6", "Art. 25", "Art. 26", "Art. 27", "Art. 50", "Art. 86", "Anexa I", "Anexa III"],
  },
];

export const RULESET_VERSION = RULESET_CHANGELOG[0].version;

/** Modificările publicate după o anumită versiune (cele mai noi primele). */
export function changesSince(version: string | null | undefined): RulesetChange[] {
  const idx = RULESET_CHANGELOG.findIndex((c) => c.version === version);
  return idx === -1 ? RULESET_CHANGELOG : RULESET_CHANGELOG.slice(0, idx);
}

// ─── Compararea a două încadrări ─────────────────────────

export interface ClassificationDiff {
  riskChanged: { from: RiskLevel; to: RiskLevel } | null;
  roleChanged: { from: string; to: string } | null;
  added: ObligationTemplate[];
  removed: ObligationTemplate[];
  /** obligații păstrate, cu data de aplicare schimbată */
  datesChanged: { code: string; article: string; title: string; from: string; to: string }[];
  /** obligații păstrate, cu titlul / textul / articolul schimbat */
  textsChanged: string[];
  /** schimbare de fond: cere o nouă verificare a avocatului */
  significant: boolean;
  /** nicio diferență */
  identical: boolean;
}

export function compareClassifications(prev: ClassificationResult | null | undefined, next: ClassificationResult): ClassificationDiff {
  if (!prev) {
    return { riskChanged: null, roleChanged: null, added: next.obligations, removed: [], datesChanged: [], textsChanged: [], significant: true, identical: false };
  }
  const prevMap = new Map(prev.obligations.map((o) => [o.code, o]));
  const nextMap = new Map(next.obligations.map((o) => [o.code, o]));
  const added = next.obligations.filter((o) => !prevMap.has(o.code));
  const removed = prev.obligations.filter((o) => !nextMap.has(o.code));
  const datesChanged: ClassificationDiff["datesChanged"] = [];
  const textsChanged: string[] = [];
  for (const o of next.obligations) {
    const p = prevMap.get(o.code);
    if (!p) continue;
    if (p.appliesFrom !== o.appliesFrom) datesChanged.push({ code: o.code, article: o.article, title: o.title, from: p.appliesFrom, to: o.appliesFrom });
    if (p.title !== o.title || p.description !== o.description || p.article !== o.article) textsChanged.push(o.code);
  }
  const riskChanged = prev.riskLevel !== next.riskLevel ? { from: prev.riskLevel, to: next.riskLevel } : null;
  const roleChanged = prev.role !== next.role ? { from: prev.role, to: next.role } : null;
  const basisChanged = prev.highRiskBasis !== next.highRiskBasis;
  const significant = !!riskChanged || !!roleChanged || basisChanged || added.length > 0 || removed.length > 0;
  const identical = !significant && datesChanged.length === 0 && textsChanged.length === 0
    && JSON.stringify(prev.reasons) === JSON.stringify(next.reasons) && JSON.stringify(prev.warnings) === JSON.stringify(next.warnings);
  return { riskChanged, roleChanged, added, removed, datesChanged, textsChanged, significant, identical };
}

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
};

/** Rezumat pe înțelesul avocatului. */
export function describeDiff(diff: ClassificationDiff): string[] {
  const lines: string[] = [];
  if (diff.riskChanged) lines.push(`Nivelul de risc s-a schimbat: ${RISK_LABELS[diff.riskChanged.from]} → ${RISK_LABELS[diff.riskChanged.to]}.`);
  if (diff.roleChanged) lines.push(`Rolul firmei s-a schimbat: ${diff.roleChanged.from} → ${diff.roleChanged.to}.`);
  if (diff.added.length) lines.push(`Obligații noi: ${diff.added.map((o) => `${o.article} — ${o.title}`).join("; ")}.`);
  if (diff.removed.length) lines.push(`Obligații care nu mai se aplică: ${diff.removed.map((o) => `${o.article} — ${o.title}`).join("; ")}.`);
  if (diff.datesChanged.length) lines.push(`Termene modificate: ${diff.datesChanged.map((d) => `${d.article} (${fmtDate(d.from)} → ${fmtDate(d.to)})`).join("; ")}.`);
  return lines;
}

// ─── Planul de reîncadrare al unui sistem ────────────────

export interface ReclassificationPlan {
  classification: ClassificationResult;
  /** nivelul de risc efectiv de salvat (încadrarea manuală a avocatului are prioritate) */
  riskLevel: RiskLevel;
  diff: ClassificationDiff;
  /** sistemul trebuie retrimis la verificarea avocatului */
  needsReview: boolean;
  /** nota afișată avocatului; null dacă nu e nevoie de verificare */
  note: string | null;
  /** încadrarea manuală a avocatului diferă acum de cea calculată */
  overrideConflict: boolean;
}

export function planReclassification(input: {
  answers: Partial<AiSystemAnswers>;
  stored: ClassificationResult | null | undefined;
  riskOverride: RiskLevel | null | undefined;
  fromVersion: string | null | undefined;
}): ReclassificationPlan {
  const classification = classifyAiSystem(input.answers);
  const diff = compareClassifications(input.stored, classification);
  const override = input.riskOverride ?? null;
  const overrideConflict = !!override && override !== classification.riskLevel && (diff.riskChanged !== null || !input.stored);
  const needsReview = diff.significant;
  let note: string | null = null;
  if (needsReview) {
    const versions = changesSince(input.fromVersion).map((c) => `${c.version} — ${c.title}`).join(", ");
    const lines = describeDiff(diff);
    if (overrideConflict) {
      lines.push(`Încadrarea manuală a avocatului (${RISK_LABELS[override!]}) a fost păstrată, dar diferă de noua încadrare calculată (${RISK_LABELS[classification.riskLevel]}).`);
    }
    note = [`Reîncadrat după actualizarea legislației${versions ? ` (${versions})` : ""}.`, ...lines].join(" ");
  }
  return { classification, riskLevel: override ?? classification.riskLevel, diff, needsReview, note, overrideConflict };
}
