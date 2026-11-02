import { describe, it, expect } from "vitest";
import { classifyAiSystem, normalizeAnswers, parseLawRefs, type AiSystemAnswers } from "@togato/shared";
import { buildMemoRequest, parseMemoResponse, selectLegalPassages, type MemoInput } from "./memo";

function input(answers: Partial<AiSystemAnswers>): MemoInput {
  const a = normalizeAnswers(answers);
  return {
    clientName: "Client SRL", caen: "7810", caenDescription: null,
    system: { name: "Filtrare CV", vendor: "HireSmart", description: "Filtrează CV-urile", purpose: "Recrutare", department: "HR" },
    answers: a, classification: classifyAiSystem(a),
  };
}

describe("selectLegalPassages", () => {
  it("trimite alineatele exacte ale obligațiilor și punctul din Anexa III", () => {
    const i = input({ annexIII: ["4a_recrutare"], workplace: true, decisionsOnPersons: true });
    const refs = selectLegalPassages(i).map((p) => p.ref);
    expect(refs).toEqual(expect.arrayContaining(["Art. 26(7)", "Art. 26(2)", "Art. 86", "Anexa III pct. 4", "Art. 6(3)"]));
    expect(refs).not.toContain("Art. 113");
    expect(new Set(refs).size).toBe(refs.length); // fără duplicate
  });

  it("textul pasajului e cel oficial", () => {
    const p = selectLegalPassages(input({ annexIII: ["4a_recrutare"], workplace: true })).find((x) => x.ref === "Art. 26(7)")!;
    expect(p.heading).toContain("Articolul 26");
    expect(p.lines[0]).toMatch(/^\(7\) Înainte de a pune în funcțiune/);
  });

  it("pentru Art. 5 trimite lista practicilor interzise, nu tot articolul", () => {
    const refs = selectLegalPassages(input({ prohibited: ["5f_emotii_munca_scoala"] })).map((p) => p.ref);
    expect(refs).toContain("Art. 5(1)");
    expect(refs).not.toContain("Art. 5");
  });

  it("rămâne în limite chiar și pentru un furnizor cu risc ridicat (multe articole)", () => {
    const ps = selectLegalPassages(input({ role: "furnizor", annexIII: ["5b_scoring_credit"], transparency: ["chatbot", "continut_sintetic"] }));
    const total = ps.reduce((s, p) => s + p.lines.join("\n").length, 0);
    expect(total).toBeLessThanOrEqual(60000 + 100);
    expect(ps.length).toBeGreaterThan(10);
  });

  it("titlurile pasajelor pot fi deschise cu LawRef în interfață", () => {
    for (const p of selectLegalPassages(input({ annexIII: ["5b_scoring_credit"], publicAuthority: true }))) {
      expect(parseLawRefs(p.ref).length, p.ref).toBe(1);
    }
  });
});

describe("buildMemoRequest", () => {
  it("trimite fiecare pasaj ca document cu citări activate, înaintea dosarului", () => {
    const i = input({ annexIII: ["4a_recrutare"], workplace: true });
    const passages = selectLegalPassages(i);
    const req = buildMemoRequest(i, passages);
    const content = req.messages[0].content;
    const docs = content.filter((b) => b.type === "document");
    expect(docs).toHaveLength(passages.length);
    expect(docs.every((d: any) => d.citations?.enabled === true && d.source.type === "content")).toBe(true);
    expect(content[content.length - 1].type).toBe("text");
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
  });
});

describe("parseMemoResponse", () => {
  it("numerotează sursele și le refolosește la aceeași citare", () => {
    const parsed = parseMemoResponse([
      { type: "thinking" },
      { type: "text", text: "## Încadrare\nSistemul e cu risc ridicat", citations: null },
      { type: "text", text: ", fiind folosit la recrutare", citations: [{ type: "content_block_location", document_title: "Anexa III pct. 4", cited_text: "(a) sisteme de IA destinate recrutării" }] },
      { type: "text", text: ". Angajații trebuie informați", citations: [{ type: "content_block_location", document_title: "Art. 26(7)", cited_text: "(7) Înainte de a pune în funcțiune..." }] },
      { type: "text", text: " înainte de utilizare", citations: [{ type: "content_block_location", document_title: "Art. 26(7)", cited_text: "(7) Înainte de a pune în funcțiune..." }] },
      { type: "text", text: "." },
    ]);
    expect(parsed.text).toBe("## Încadrare\nSistemul e cu risc ridicat, fiind folosit la recrutare[1]. Angajații trebuie informați[2] înainte de utilizare[2].");
    expect(parsed.citations).toEqual([
      { n: 1, ref: "Anexa III pct. 4", quote: "(a) sisteme de IA destinate recrutării" },
      { n: 2, ref: "Art. 26(7)", quote: "(7) Înainte de a pune în funcțiune..." },
    ]);
  });

  it("un răspuns fără citări rămâne text simplu", () => {
    expect(parseMemoResponse([{ type: "text", text: "  Text  " }])).toEqual({ text: "Text", citations: [] });
  });
});
