import { describe, it, expect } from "vitest";
import { classifyAiSystem, AI_ACT_DATES } from "./aiAct";

const codes = (r: ReturnType<typeof classifyAiSystem>) => r.obligations.map((o) => o.code);

describe("classifyAiSystem", () => {
  it("ChatGPT folosit intern = risc minim, doar verificarea Art. 5", () => {
    const r = classifyAiSystem({ role: "implementator" });
    expect(r.riskLevel).toBe("minim");
    expect(r.role).toBe("implementator");
    expect(codes(r)).toEqual(["art5_verificare"]);
  });

  it("practica interzisă are prioritate față de orice altceva", () => {
    const r = classifyAiSystem({ prohibited: ["5f_emotii_munca_scoala"], annexIII: ["4a_recrutare"], transparency: ["chatbot"] });
    expect(r.riskLevel).toBe("interzis");
    expect(codes(r)).toEqual(["art5_incetare"]);
  });

  it("filtrare CV-uri cu instrument terț = risc ridicat, obligații de implementator din dec. 2027", () => {
    const r = classifyAiSystem({ role: "implementator", annexIII: ["4a_recrutare"], workplace: true, decisionsOnPersons: true });
    expect(r.riskLevel).toBe("risc_ridicat");
    expect(r.highRiskBasis).toBe("anexa_iii");
    expect(codes(r)).toContain("art26_2_supraveghere");
    expect(codes(r)).toContain("art26_7_angajati");
    expect(codes(r)).toContain("art86_explicatie");
    expect(codes(r)).not.toContain("art27_fria");
    expect(codes(r)).not.toContain("art11_documentatie");
    expect(r.obligations.find((o) => o.code === "art26_2_supraveghere")!.appliesFrom).toBe(AI_ACT_DATES.highRiskAnnexIII);
  });

  it("scoring de credit cere FRIA (Art. 27)", () => {
    const r = classifyAiSystem({ annexIII: ["5b_scoring_credit"] });
    expect(codes(r)).toContain("art27_fria");
  });

  it("derogarea Art. 6(3) scoate sistemul din risc ridicat, dar nu și când face profilare", () => {
    const derogat = classifyAiSystem({ annexIII: ["4a_recrutare"], derogations: ["6_3a_sarcina_procedurala"] });
    expect(derogat.riskLevel).toBe("minim");
    expect(derogat.warnings.length).toBeGreaterThan(0);

    const cuProfilare = classifyAiSystem({ annexIII: ["4a_recrutare"], derogations: ["6_3a_sarcina_procedurala"], profiling: true });
    expect(cuProfilare.riskLevel).toBe("risc_ridicat");
  });

  it("furnizorul derogat trebuie să documenteze evaluarea și să înregistreze sistemul", () => {
    const r = classifyAiSystem({ role: "furnizor", annexIII: ["3b_evaluare_invatare"], derogations: ["6_3d_pregatitoare"] });
    expect(codes(r)).toEqual(expect.arrayContaining(["art6_4_evaluare", "art49_2_inregistrare"]));
  });

  it("sistem rebranduit cu risc ridicat = obligații de furnizor (Art. 25)", () => {
    const r = classifyAiSystem({ role: "implementator_modificat", annexIII: ["5b_scoring_credit"] });
    expect(r.role).toBe("furnizor");
    expect(codes(r)).toContain("art43_conformitate");
  });

  it("Anexa I se aplică din august 2028", () => {
    const r = classifyAiSystem({ role: "furnizor", annexI: true });
    expect(r.highRiskBasis).toBe("anexa_i");
    expect(r.obligations.find((o) => o.code === "art9_riscuri")!.appliesFrom).toBe(AI_ACT_DATES.highRiskAnnexI);
  });

  it("chatbot pe site al unui implementator = transparență, verificare Art. 50(1)", () => {
    const r = classifyAiSystem({ transparency: ["chatbot"] });
    expect(r.riskLevel).toBe("transparenta");
    expect(codes(r)).toContain("art50_1_verificare");
    expect(codes(r)).not.toContain("art50_1_furnizor");
  });

  it("texte de interes public revizuite editorial nu cer marcare", () => {
    expect(codes(classifyAiSystem({ transparency: ["text_interes_public"] }))).toContain("art50_4_text");
    expect(codes(classifyAiSystem({ transparency: ["text_interes_public"], editorialReview: true }))).not.toContain("art50_4_text");
  });

  it("ignoră coduri necunoscute", () => {
    const r = classifyAiSystem({ annexIII: ["inexistent"], prohibited: ["x"] } as any);
    expect(r.riskLevel).toBe("minim");
  });
});
