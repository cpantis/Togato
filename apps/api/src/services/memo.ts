/**
 * Memoriu juridic generat cu Claude pe baza chestionarului și a încadrării deterministe.
 * Rolul lui: să explice încadrarea, să semnaleze inconsecvențe și informații lipsă.
 * Avocatul rămâne cel care decide.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  ANNEX_III_USES, DEROGATIONS, PROHIBITED_PRACTICES, RISK_LABELS, ROLE_OPTIONS, TRANSPARENCY_TRIGGERS,
  type AiSystemAnswers, type ClassificationResult,
} from "@togato/shared";

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function memoAvailable(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM_PROMPT = `Ești un asistent juridic care pregătește analize pentru avocați din România, pe Regulamentul (UE) 2024/1689 privind inteligența artificială (AI Act), cu modificările aduse de pachetul Omnibus digital din 2026 (obligațiile pentru risc ridicat din Anexa III se aplică din 2 decembrie 2027, cele din Anexa I din 2 august 2028; Art. 50 din 2 august 2026; Art. 4 și Art. 5 din 2 februarie 2025).

Primești descrierea unui sistem AI folosit sau dezvoltat de o firmă-client, răspunsurile la chestionar și încadrarea propusă de un algoritm.

Scrie un memoriu scurt, în limba română, pentru avocatul care verifică dosarul. Structură, cu titluri Markdown de nivel 2:
## Încadrare
O frază cu nivelul de risc și rolul firmei (furnizor sau implementator), apoi justificarea, cu articolele citate.
## Puncte de verificat
Ce ar trebui confirmat cu clientul: răspunsuri care par în contradicție cu descrierea sistemului, situații limită, informații lipsă.
## Pași recomandați
3–6 pași concreți, în ordinea priorității.

Reguli:
- Citează doar articole care există în AI Act sau GDPR. Dacă nu ești sigur de un număr de articol, descrie obligația fără număr.
- Nu inventa fapte despre client. Dacă descrierea e insuficientă, spune ce lipsește.
- Dacă descrierea sugerează o încadrare diferită de cea propusă, spune explicit și explică de ce.
- Fără introduceri și fără încheieri de politețe. Maximum 450 de cuvinte.`;

function labels(codes: string[], list: { code: string; label: string; article: string }[]) {
  return codes.map((c) => list.find((o) => o.code === c)).filter(Boolean).map((o) => `${o!.label} (${o!.article})`);
}

export async function generateMemo(input: {
  clientName: string;
  caen: string | null;
  caenDescription: string | null;
  system: { name: string; vendor: string | null; description: string | null; purpose: string | null; department: string | null };
  answers: AiSystemAnswers;
  classification: ClassificationResult;
}): Promise<string> {
  const { answers: a, classification: c } = input;
  const yesNo = (v: boolean) => (v ? "da" : "nu");
  const facts = [
    `Client: ${input.clientName}${input.caen ? ` (CAEN ${input.caen}${input.caenDescription ? ` — ${input.caenDescription}` : ""})` : ""}`,
    `Sistem: ${input.system.name}${input.system.vendor ? ` — furnizor ${input.system.vendor}` : ""}`,
    `Departament: ${input.system.department || "nespecificat"}`,
    `Descriere: ${input.system.description || "nespecificată"}`,
    `Scop: ${input.system.purpose || "nespecificat"}`,
    "",
    "Răspunsuri la chestionar:",
    `- Rolul firmei: ${ROLE_OPTIONS.find((r) => r.code === a.role)?.label}`,
    `- Practici interzise bifate: ${labels(a.prohibited, PROHIBITED_PRACTICES).join("; ") || "niciuna"}`,
    `- Domenii Anexa III bifate: ${labels(a.annexIII, ANNEX_III_USES).join("; ") || "niciunul"}`,
    `- Componentă de siguranță a unui produs reglementat (Anexa I): ${yesNo(a.annexI)}`,
    `- Derogări Art. 6(3) bifate: ${labels(a.derogations, DEROGATIONS).join("; ") || "niciuna"}`,
    `- Face profilarea persoanelor: ${yesNo(a.profiling)}`,
    `- Situații de transparență: ${labels(a.transparency, TRANSPARENCY_TRIGGERS).join("; ") || "niciuna"}`,
    `- Revizuire editorială umană a textelor publicate: ${yesNo(a.editorialReview)}`,
    `- Organism public / servicii publice: ${yesNo(a.publicService)}`,
    `- Folosit la locul de muncă, privește angajații: ${yesNo(a.workplace)}`,
    `- Ia sau asistă decizii despre persoane: ${yesNo(a.decisionsOnPersons)}`,
    `- Dezvoltă un model AI de uz general: ${yesNo(a.gpaiProvider)}`,
    "",
    `Încadrarea propusă de algoritm: ${RISK_LABELS[c.riskLevel]}, rol ${c.role}.`,
    `Motive: ${c.reasons.map((r) => `${r.text} [${r.article}]`).join("; ")}`,
    c.warnings.length ? `Avertismente: ${c.warnings.join(" ")}` : "",
    `Obligații identificate: ${c.obligations.map((o) => `${o.article} ${o.title}`).join("; ")}`,
  ].filter((l) => l !== undefined).join("\n");

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `<dosar>\n${facts}\n</dosar>` }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Analiza AI nu a putut fi generată pentru acest dosar.");
  }
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("Analiza AI a returnat un răspuns gol. Reîncearcă.");
  return text;
}
