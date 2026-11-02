import { describe, it, expect } from "vitest";
import {
  ANNEX_III_USES, CLIENT_OBLIGATIONS, DEROGATIONS, PROHIBITED_PRACTICES, TRANSPARENCY_TRIGGERS,
  classifyAiSystem, parseLawRefs, type AiSystemAnswers,
} from "@togato/shared";
import { loadLaw, lookup, resolveRef } from "./law";

/** Toate trimiterile pe care aplicația le poate afișa: opțiunile chestionarului și obligațiile / motivele
 *  rezultate din combinații reprezentative de răspunsuri. */
function allCatalogRefs(): string[] {
  const refs = new Set<string>();
  for (const list of [PROHIBITED_PRACTICES, ANNEX_III_USES, DEROGATIONS, TRANSPARENCY_TRIGGERS]) for (const o of list) refs.add(o.article);
  for (const o of CLIENT_OBLIGATIONS) refs.add(o.article);
  const roles: AiSystemAnswers["role"][] = ["implementator", "furnizor", "implementator_modificat"];
  const variants: Partial<AiSystemAnswers>[] = [
    {}, { prohibited: ["5a_manipulare"] }, { annexI: true },
    { annexIII: ["4a_recrutare"], workplace: true, decisionsOnPersons: true, publicService: true, publicAuthority: true },
    { annexIII: ["5b_scoring_credit"] }, { annexIII: ["5c_asigurari_viata_sanatate"] },
    { annexIII: ["4a_recrutare"], derogations: DEROGATIONS.map((d) => d.code) },
    { annexIII: ["4a_recrutare"], derogations: ["6_3a_sarcina_procedurala"], profiling: true },
    { transparency: TRANSPARENCY_TRIGGERS.map((t) => t.code) },
    { transparency: ["text_interes_public"], editorialReview: true },
    { gpaiProvider: true },
    { annexI: true, decisionsOnPersons: true },
    { annexI: true, annexIII: ["2_infrastructura_critica"], publicService: true, decisionsOnPersons: true },
  ];
  for (const role of roles) for (const v of variants) {
    const c = classifyAiSystem({ ...v, role });
    for (const o of c.obligations) refs.add(o.article);
    for (const r of c.reasons) refs.add(r.article);
  }
  return [...refs];
}

describe("textul oficial AI Act", () => {
  it("are toate articolele și anexele", () => {
    const law = loadLaw();
    expect(Object.keys(law.articles)).toHaveLength(113);
    expect(Object.keys(law.annexes)).toEqual(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"]);
    expect(law.source.celex).toBe("32024R1689");
  });

  it("fiecare trimitere din catalog există în textul oficial", () => {
    const missing: string[] = [];
    for (const text of allCatalogRefs()) {
      for (const ref of parseLawRefs(text)) {
        const r = resolveRef(ref);
        if (!r.found) missing.push(`${text} → ${ref.label}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("fiecare utilizare din Anexa III corespunde punctului și literei din lege", () => {
    for (const u of ANNEX_III_USES) {
      const [ref] = parseLawRefs(u.article);
      expect(ref.kind, u.article).toBe("annex");
      expect(resolveRef(ref).found, u.article).toBe(true);
    }
  });

  it("întoarce textul exact al alineatului", () => {
    const { results } = lookup("Art. 26(7)");
    expect(results[0].heading).toContain("Articolul 26");
    expect(results[0].lines[0]).toMatch(/^\(7\) Înainte de a pune în funcțiune/);
  });

  it("evidențiază litera cerută", () => {
    const [r] = lookup("Art. 5(1)(f)").results;
    expect(r.focus).toBe("f");
    expect(r.lines.some((l) => l.trim().startsWith("(f)"))).toBe(true);
  });

  it("raportează trimiterile inexistente", () => {
    expect(lookup("Art. 200").results[0].found).toBe(false);
    expect(lookup("Art. 26(40)").results[0].found).toBe(false);
  });
});
