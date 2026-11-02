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

  it("înregistrarea Art. 26(8) se cere doar autorităților publice, FRIA și serviciilor publice", () => {
    const privat = codes(classifyAiSystem({ annexIII: ["5a_beneficii_publice"], publicService: true }));
    expect(privat).toContain("art27_fria");
    expect(privat).not.toContain("art26_8_inregistrare");
    const autoritate = codes(classifyAiSystem({ annexIII: ["5a_beneficii_publice"], publicService: true, publicAuthority: true }));
    expect(autoritate).toContain("art26_8_inregistrare");
  });

  it("Anexa I: fără Art. 26(11) și Art. 86 (privesc doar Anexa III)", () => {
    const c = codes(classifyAiSystem({ annexI: true, decisionsOnPersons: true, publicService: true }));
    expect(c).toContain("art26_2_supraveghere");
    expect(c).not.toContain("art26_11_informare");
    expect(c).not.toContain("art86_explicatie");
    expect(c).not.toContain("art27_fria");
  });

  it("Anexa III pct. 2 (infrastructură critică): fără FRIA și fără Art. 86, dar cu Art. 26(11)", () => {
    const c = codes(classifyAiSystem({ annexIII: ["2_infrastructura_critica"], publicService: true, decisionsOnPersons: true }));
    expect(c).not.toContain("art27_fria");
    expect(c).not.toContain("art86_explicatie");
    expect(c).toContain("art26_11_informare");
  });

  it("pct. 2 împreună cu altă utilizare din Anexa III păstrează FRIA și Art. 86", () => {
    const c = codes(classifyAiSystem({ annexIII: ["2_infrastructura_critica", "5a_beneficii_publice"], publicService: true, decisionsOnPersons: true }));
    expect(c).toContain("art27_fria");
    expect(c).toContain("art86_explicatie");
  });

  it("Anexa I + Anexa III: temeiul e Anexa III, ambele motive apar, cu avertisment pentru Anexa I", () => {
    const r = classifyAiSystem({ annexI: true, annexIII: ["4a_recrutare"] });
    expect(r.highRiskBasis).toBe("anexa_iii");
    expect(r.reasons.map((x) => x.article)).toEqual(expect.arrayContaining(["Art. 6(1) + Anexa I", "Anexa III pct. 4(a)"]));
    expect(r.warnings.some((w) => w.includes("Anexa I"))).toBe(true);
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

describe("calificare și domeniu de aplicare", () => {
  it("un instrument care nu e sistem de IA e în afara AI Act, fără obligații", () => {
    const r = classifyAiSystem({ qualification: "nu", annexIII: ["4a_recrutare"] });
    expect(r.riskLevel).toBe("neaplicabil");
    expect(r.obligations).toEqual([]);
    expect(r.reasons[0].article).toBe("Art. 3 pct. 1");
  });

  it("calificarea neconfirmată nu blochează încadrarea, dar e semnalată", () => {
    const r = classifyAiSystem({ annexIII: ["4a_recrutare"] });
    expect(r.riskLevel).toBe("risc_ridicat");
    expect(r.warnings.some((w) => w.includes("Art. 3 pct. 1"))).toBe(true);
    expect(classifyAiSystem({ qualification: "da", annexIII: ["4a_recrutare"] }).warnings.some((w) => w.includes("Art. 3 pct. 1"))).toBe(false);
  });

  it("excluderile din Art. 2 scot sistemul din domeniu", () => {
    const r = classifyAiSystem({ qualification: "da", scopeExclusions: ["2_8_dezvoltare"], annexIII: ["5b_scoring_credit"] });
    expect(r.riskLevel).toBe("neaplicabil");
    expect(r.reasons[0].article).toBe("Art. 2(8)");
  });

  it("sursa deschisă e exclusă doar fără risc ridicat și fără Art. 50", () => {
    expect(classifyAiSystem({ qualification: "da", scopeExclusions: ["2_12_sursa_deschisa"] }).riskLevel).toBe("neaplicabil");
    const hr = classifyAiSystem({ qualification: "da", scopeExclusions: ["2_12_sursa_deschisa"], annexIII: ["4a_recrutare"] });
    expect(hr.riskLevel).toBe("risc_ridicat");
    expect(hr.warnings.some((w) => w.includes("Art. 2(12)"))).toBe(true);
    expect(classifyAiSystem({ qualification: "da", scopeExclusions: ["2_12_sursa_deschisa"], transparency: ["chatbot"] }).riskLevel).toBe("transparenta");
  });
});

describe("importatori și distribuitori", () => {
  it("importatorul unui sistem cu risc ridicat are obligațiile din Art. 23", () => {
    const r = classifyAiSystem({ qualification: "da", role: "importator", annexIII: ["5b_scoring_credit"] });
    expect(r.role).toBe("importator");
    expect(codes(r)).toEqual(expect.arrayContaining(["art23_1_verificare", "art23_5_pastrare"]));
    expect(codes(r)).not.toContain("art26_2_supraveghere");
    expect(codes(r)).not.toContain("art9_riscuri");
  });

  it("distribuitorul are obligațiile din Art. 24, fără obligații de transparență proprii", () => {
    const r = classifyAiSystem({ qualification: "da", role: "distribuitor", annexIII: ["4a_recrutare"], transparency: ["chatbot"] });
    expect(r.role).toBe("distribuitor");
    expect(codes(r)).toEqual(expect.arrayContaining(["art24_1_verificare", "art24_4_corective"]));
    expect(codes(r).some((c) => c.startsWith("art50"))).toBe(false);
    expect(r.warnings.some((w) => w.includes("Art. 50"))).toBe(true);
  });

  it("importatorul nu primește obligațiile de furnizor la derogarea Art. 6(3)", () => {
    const r = classifyAiSystem({ qualification: "da", role: "importator", annexIII: ["4a_recrutare"], derogations: ["6_3a_sarcina_procedurala"] });
    expect(codes(r)).not.toContain("art6_4_evaluare");
  });
});
