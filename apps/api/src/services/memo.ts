/**
 * Memoriu juridic generat cu Claude, ancorat în textul oficial al AI Act.
 *
 * Pasajele relevante din lege (articolele obligațiilor și ale motivelor încadrării) se trimit ca
 * documente cu citări activate; Claude citează direct din ele, iar fiecare afirmație citată primește
 * o trimitere [n] către pasajul exact. Avocatul rămâne cel care decide.
 *
 * Funcțiile pure (selectLegalPassages, buildMemoRequest, parseMemoResponse) sunt testate separat.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  ANNEX_III_USES, DEROGATIONS, PROHIBITED_PRACTICES, QUALIFICATION_OPTIONS, RISK_LABELS, ROLE_OPTIONS, SCOPE_EXCLUSIONS, TRANSPARENCY_TRIGGERS,
  parseLawRefs, type AiSystemAnswers, type ClassificationResult, type LawRef,
} from "@togato/shared";
import { loadLaw, resolveRef, type LawData } from "./law";

const MODEL = "claude-opus-5-5";
/** limite ca cererea să rămână rezonabilă ca dimensiune și cost */
const MAX_PASSAGE_CHARS = 6000;
const MAX_TOTAL_CHARS = 60000;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function memoAvailable(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

// ─── 1. Pasajele din lege ────────────────────────────────

export interface LegalPassage {
  /** trimitere scurtă, interpretabilă de LawRef: „Art. 26(7)”, „Anexa III pct. 4” */
  ref: string;
  heading: string;
  lines: string[];
}

/** Cheie unică pe pasaj: articol + alineat sau anexă + punct (literele cad pe pasajul părinte). */
function passageKey(r: LawRef): string | null {
  if (r.kind === "article") return `art:${r.article}:${r.paragraph ?? "*"}`;
  if (r.kind === "annex") return `anx:${r.annex}:${r.item ?? "*"}`;
  return null;
}

function passageRef(r: LawRef): string {
  if (r.kind === "article") return r.paragraph ? `Art. ${r.article}(${r.paragraph})` : `Art. ${r.article}`;
  if (r.kind === "annex") return r.item ? `Anexa ${r.annex} pct. ${r.item}` : `Anexa ${r.annex}`;
  return r.label;
}

export function selectLegalPassages(input: { answers: AiSystemAnswers; classification: ClassificationResult }, law: LawData = loadLaw()): LegalPassage[] {
  const { answers: a, classification: c } = input;
  const texts: string[] = [];
  for (const r of c.reasons) texts.push(r.article);
  for (const o of c.obligations) texts.push(o.article);
  // contextul de încadrare, chiar dacă nu apare în obligații
  if (a.qualification !== "da") texts.push("Art. 3 pct. 1");
  for (const code of a.scopeExclusions) texts.push(SCOPE_EXCLUSIONS.find((e) => e.code === code)?.article ?? "");
  if (a.prohibited.length) texts.push("Art. 5(1)");
  if (a.annexIII.length) texts.push("Art. 6(2)", "Art. 6(3)");
  if (a.role === "implementator_modificat") texts.push("Art. 25(1)");
  for (const code of a.transparency) texts.push(TRANSPARENCY_TRIGGERS.find((t) => t.code === code)?.article ?? "");

  const seen = new Set<string>();
  const out: LegalPassage[] = [];
  let total = 0;
  for (const text of texts) {
    for (const ref of parseLawRefs(text)) {
      if (ref.kind === "external") continue;
      // „Art. 5” fără alineat înseamnă lista practicilor interzise (alin. 1), nu tot articolul
      const r: LawRef = ref.kind === "article" && ref.article === "5" && !ref.paragraph ? { ...ref, paragraph: "1" } : ref;
      const key = passageKey(r);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const resolved = resolveRef({ ...r, point: undefined } as LawRef, law);
      if (!resolved.found || !resolved.lines.length) continue;
      let lines = resolved.lines.map((l) => l.trim());
      let size = lines.join("\n").length;
      if (size > MAX_PASSAGE_CHARS) {
        const kept: string[] = [];
        let n = 0;
        for (const l of lines) {
          if (n + l.length > MAX_PASSAGE_CHARS) break;
          kept.push(l);
          n += l.length;
        }
        lines = [...kept, "[…] (pasaj trunchiat)"];
        size = n;
      }
      if (total + size > MAX_TOTAL_CHARS) continue;
      total += size;
      out.push({ ref: passageRef(r), heading: `${resolved.heading}${resolved.part ? `, ${resolved.part}` : ""}`, lines });
    }
  }
  return out;
}

// ─── 2. Cererea către Claude ─────────────────────────────

const SYSTEM_PROMPT = `Ești un asistent juridic care pregătește analize pentru avocați din România, pe Regulamentul (UE) 2024/1689 privind inteligența artificială (AI Act).

Primești:
- pasaje din textul oficial al regulamentului, în limba română, ca documente separate (titlul fiecăruia e trimiterea, ex. „Art. 26(7)”);
- descrierea unui sistem AI folosit sau dezvoltat de o firmă-client, răspunsurile la chestionar și încadrarea propusă de un algoritm.

Atenție la versiune: pasajele sunt textul INIȚIAL din Jurnalul Oficial (12.7.2024). Pachetul Omnibus digital din 2026 a modificat între timp: termenul pentru obligațiile privind sistemele cu risc ridicat din Anexa III (2 decembrie 2027) și din Anexa I (2 august 2028), iar la Art. 4 obligația de a „asigura” alfabetizarea AI a devenit obligația de a „sprijini” alfabetizarea. Pe aceste puncte aplică modificările Omnibus și menționează că textul citat e cel inițial.

Scrie un memoriu scurt, în limba română, pentru avocatul care verifică dosarul. Structură, cu titluri Markdown de nivel 2:
## Încadrare
Nivelul de risc și rolul firmei (furnizor sau implementator), cu justificarea.
## Puncte de verificat
Ce ar trebui confirmat cu clientul: răspunsuri care par în contradicție cu descrierea, situații limită, informații lipsă.
## Pași recomandați
3–6 pași concreți, în ordinea priorității.

Reguli:
- Sprijină fiecare afirmație juridică pe pasajele primite, citându-le. Nu cita articole care nu se află printre documente; dacă ai nevoie de o prevedere care lipsește, spune că trebuie verificată separat.
- Nu inventa fapte despre client. Dacă descrierea e insuficientă, spune ce lipsește.
- Dacă descrierea sugerează o încadrare diferită de cea propusă, spune explicit și explică de ce.
- Fără introduceri și fără încheieri de politețe. Maximum 450 de cuvinte, fără să socotești citatele.`;

export interface MemoInput {
  clientName: string;
  caen: string | null;
  caenDescription: string | null;
  system: { name: string; vendor: string | null; description: string | null; purpose: string | null; department: string | null };
  answers: AiSystemAnswers;
  classification: ClassificationResult;
}

function labels(codes: string[], list: { code: string; label: string; article: string }[]) {
  return codes.map((c) => list.find((o) => o.code === c)).filter(Boolean).map((o) => `${o!.label} (${o!.article})`);
}

export function dossierText(input: MemoInput): string {
  const { answers: a, classification: c } = input;
  const yesNo = (v: boolean) => (v ? "da" : "nu");
  return [
    `Client: ${input.clientName}${input.caen ? ` (CAEN ${input.caen}${input.caenDescription ? ` — ${input.caenDescription}` : ""})` : ""}`,
    `Sistem: ${input.system.name}${input.system.vendor ? ` — furnizor ${input.system.vendor}` : ""}`,
    `Departament: ${input.system.department || "nespecificat"}`,
    `Descriere: ${input.system.description || "nespecificată"}`,
    `Scop: ${input.system.purpose || "nespecificat"}`,
    "",
    "Răspunsuri la chestionar:",
    `- E sistem de IA (Art. 3 pct. 1): ${QUALIFICATION_OPTIONS.find((q) => q.code === a.qualification)?.label}`,
    `- Excluderi din domeniul de aplicare (Art. 2): ${labels(a.scopeExclusions, SCOPE_EXCLUSIONS).join("; ") || "niciuna"}`,
    `- Rolul firmei: ${ROLE_OPTIONS.find((r) => r.code === a.role)?.label}`,
    `- Practici interzise bifate: ${labels(a.prohibited, PROHIBITED_PRACTICES).join("; ") || "niciuna"}`,
    `- Domenii Anexa III bifate: ${labels(a.annexIII, ANNEX_III_USES).join("; ") || "niciunul"}`,
    `- Componentă de siguranță a unui produs reglementat (Anexa I): ${yesNo(a.annexI)}`,
    `- Derogări Art. 6(3) bifate: ${labels(a.derogations, DEROGATIONS).join("; ") || "niciuna"}`,
    `- Face profilarea persoanelor: ${yesNo(a.profiling)}`,
    `- Situații de transparență: ${labels(a.transparency, TRANSPARENCY_TRIGGERS).join("; ") || "niciuna"}`,
    `- Revizuire editorială umană a textelor publicate: ${yesNo(a.editorialReview)}`,
    `- Organism de drept public / servicii publice: ${yesNo(a.publicService)}`,
    `- Autoritate publică: ${yesNo(a.publicAuthority)}`,
    `- Folosit la locul de muncă, privește angajații: ${yesNo(a.workplace)}`,
    `- Ia sau asistă decizii despre persoane: ${yesNo(a.decisionsOnPersons)}`,
    `- Dezvoltă un model AI de uz general: ${yesNo(a.gpaiProvider)}`,
    "",
    `Încadrarea propusă de algoritm: ${RISK_LABELS[c.riskLevel]}, rol ${c.role}.`,
    `Motive: ${c.reasons.map((r) => `${r.text} [${r.article}]`).join("; ")}`,
    c.warnings.length ? `Avertismente: ${c.warnings.join(" ")}` : "",
    `Obligații identificate: ${c.obligations.map((o) => `${o.article} ${o.title}`).join("; ")}`,
  ].filter(Boolean).join("\n");
}

export function buildMemoRequest(input: MemoInput, passages: LegalPassage[]) {
  const documents: Anthropic.Beta.BetaRequestDocumentBlock[] = passages.map((p) => ({
    type: "document",
    title: p.ref,
    context: p.heading,
    source: { type: "content", content: p.lines.map((line) => ({ type: "text" as const, text: line })) },
    citations: { enabled: true },
  }));
  return {
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    thinking: { type: "adaptive" as const },
    output_config: { effort: "medium" as const },
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user" as const,
      content: [
        ...documents,
        { type: "text" as const, text: `<dosar>\n${dossierText(input)}\n</dosar>\n\nScrie memoriul pentru acest dosar, citând pasajele din lege.` },
      ],
    }],
  };
}

// ─── 3. Răspunsul: text + surse numerotate ───────────────

export interface MemoCitation {
  n: number;
  /** trimiterea, deschisă cu LawRef în interfață */
  ref: string;
  quote: string;
}

export interface ParsedMemo {
  text: string;
  citations: MemoCitation[];
}

type ResponseBlock = { type: string; text?: string; citations?: Array<{ type: string; document_title?: string | null; cited_text?: string }> | null };

/** Concatenează blocurile de text; după fiecare bloc citat adaugă trimiterile [n] (aceeași sursă = același n). */
export function parseMemoResponse(blocks: ResponseBlock[]): ParsedMemo {
  const citations: MemoCitation[] = [];
  const index = new Map<string, number>();
  let text = "";
  for (const b of blocks) {
    if (b.type !== "text" || typeof b.text !== "string") continue;
    text += b.text;
    const marks: number[] = [];
    for (const c of b.citations ?? []) {
      if (!c.document_title) continue;
      const quote = (c.cited_text ?? "").trim();
      const key = `${c.document_title}::${quote}`;
      let n = index.get(key);
      if (n === undefined) {
        n = citations.length + 1;
        index.set(key, n);
        citations.push({ n, ref: c.document_title, quote });
      }
      if (!marks.includes(n)) marks.push(n);
    }
    if (marks.length) text += marks.map((n) => `[${n}]`).join("");
  }
  return { text: text.trim(), citations };
}

// ─── 4. Apelul ───────────────────────────────────────────

export async function generateMemo(input: MemoInput): Promise<ParsedMemo> {
  const passages = selectLegalPassages({ answers: input.answers, classification: input.classification });
  const response = await getClient().beta.messages.create(buildMemoRequest(input, passages));
  if (response.stop_reason === "refusal") {
    throw new Error("Analiza AI nu a putut fi generată pentru acest dosar.");
  }
  const parsed = parseMemoResponse(response.content as unknown as ResponseBlock[]);
  if (!parsed.text) throw new Error("Analiza AI a returnat un răspuns gol. Reîncearcă.");
  return parsed;
}
