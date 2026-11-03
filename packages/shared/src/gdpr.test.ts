import { describe, expect, it } from "vitest";
import { addMonths, assessDpia, breachDeadline, breachDuties, checkProcessing, dpiaRiskLevel, dsarDueDate, suggestDpiaRisks, type DpiaRisk, type ProcessingInput } from "./gdpr";

const base: ProcessingInput = {
  role: "operator", legalBases: ["6_1_c"], specialConditions: [], dataCategories: ["identificare", "contact"], subjectCategories: ["clienti"],
  recipients: null, transferOutsideEea: false, transferCountries: null, transferMechanism: null, retention: "10 ani (Codul fiscal)",
  securityMeasures: ["acces"], largeScale: false, systematicMonitoring: false, automatedDecisions: false, usesAi: false,
};

describe("registrul prelucrărilor", () => {
  it("o activitate completă nu are probleme", () => {
    const r = checkProcessing(base);
    expect(r.issues).toEqual([]);
    expect(r.dpiaLikely).toBe(false);
  });
  it("lipsuri: temei, condiție Art. 9, mecanism de transfer, păstrare, securitate", () => {
    const r = checkProcessing({ ...base, legalBases: [], dataCategories: ["sanatate"], transferOutsideEea: true, retention: " ", securityMeasures: [] });
    expect(r.issues).toHaveLength(5);
    expect(r.issues.join(" ")).toMatch(/Art\. 9\(2\)/);
  });
  it("consimțământul angajaților e semnalat", () => {
    expect(checkProcessing({ ...base, legalBases: ["6_1_a"], subjectCategories: ["angajati"] }).warnings.join(" ")).toMatch(/dezechilibru/);
  });
  it("DPIA probabilă de la două criterii EDPB (ex. angajați + sistem AI)", () => {
    const r = checkProcessing({ ...base, subjectCategories: ["angajati"], usesAi: true });
    expect(r.dpiaLikely).toBe(true);
    expect(r.dpiaReasons).toHaveLength(2);
    expect(checkProcessing({ ...base, usesAi: true }).dpiaLikely).toBe(false);
  });
  it("supravegherea video contează ca monitorizare sistematică", () => {
    expect(checkProcessing({ ...base, dataCategories: ["imagine"], subjectCategories: ["angajati"] }).dpiaLikely).toBe(true);
  });
});

describe("cererile persoanelor vizate", () => {
  it("termen: o lună, prelungibil cu încă două", () => {
    expect(dsarDueDate("2026-03-15", false)).toBe("2026-04-15");
    expect(dsarDueDate("2026-03-15", true)).toBe("2026-06-15");
  });
  it("lunile scurte: ultima zi a lunii", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
  });
});

describe("incidentele de securitate", () => {
  it("72 de ore de la luarea la cunoștință", () => {
    expect(breachDeadline("2026-11-03T10:00:00Z").toISOString()).toBe("2026-11-06T10:00:00.000Z");
  });
  it("obligațiile după risc", () => {
    expect(breachDuties("fara_risc")).toMatchObject({ notifyAuthority: false, notifySubjects: false });
    expect(breachDuties("risc")).toMatchObject({ notifyAuthority: true, notifySubjects: false });
    expect(breachDuties("risc_ridicat")).toMatchObject({ notifyAuthority: true, notifySubjects: true });
    expect(breachDuties("neevaluat").notifyAuthority).toBe(true);
  });
});

describe("evaluarea de impact obligatorie", () => {
  it("Art. 35(3): decizii automate; categorii speciale pe scară largă; zone publice monitorizate", () => {
    expect(checkProcessing({ ...base, automatedDecisions: true }).dpiaMandatory).toBe(true);
    expect(checkProcessing({ ...base, dataCategories: ["sanatate"], specialConditions: ["9_2_h"], largeScale: true }).dpiaMandatoryReasons[0]).toMatch(/35\(3\)\(b\)/);
    expect(checkProcessing({ ...base, dataCategories: ["sanatate"], specialConditions: ["9_2_h"] }).dpiaMandatory).toBe(false);
    expect(checkProcessing({ ...base, dataCategories: ["imagine"], subjectCategories: ["public"], systematicMonitoring: true, largeScale: true }).dpiaMandatoryReasons.join(" ")).toMatch(/35\(3\)\(c\)/);
  });
  it("lista ANSPDCP: bifată explicit sau dedusă din date", () => {
    const r = checkProcessing({ ...base, dpiaListItems: ["iot"] });
    expect(r.dpiaMandatory).toBe(true);
    expect(r.dpiaLikely).toBe(true);
    expect(checkProcessing({ ...base, dataCategories: ["localizare"], largeScale: true }).dpiaMandatoryReasons.join(" ")).toMatch(/localizare/);
    expect(checkProcessing({ ...base, subjectCategories: ["angajati"], systematicMonitoring: true, largeScale: true }).dpiaMandatoryReasons.join(" ")).toMatch(/vulnerabile/);
    expect(checkProcessing(base).dpiaMandatory).toBe(false);
  });
});

describe("evaluarea de impact", () => {
  const risk = (o: Partial<DpiaRisk>): DpiaRisk => ({ id: "r", title: "Acces", description: "", likelihood: 2, severity: 3, measures: "Criptare", residualLikelihood: 1, residualSeverity: 3, ...o });
  it("matricea probabilitate × gravitate", () => {
    expect(dpiaRiskLevel(1, 1)).toBe("scazut");
    expect(dpiaRiskLevel(1, 2)).toBe("scazut");
    expect(dpiaRiskLevel(1, 3)).toBe("mediu");
    expect(dpiaRiskLevel(2, 2)).toBe("mediu");
    expect(dpiaRiskLevel(2, 3)).toBe("ridicat");
  });
  it("concluzia: risc rezidual ridicat → consultare prealabilă (Art. 36)", () => {
    expect(assessDpia({ necessity: "x", risks: [risk({})] }).outcome).toBe("acceptabil_cu_masuri");
    expect(assessDpia({ necessity: "x", risks: [risk({ residualLikelihood: 1, residualSeverity: 1 })] }).outcome).toBe("acceptabil");
    expect(assessDpia({ necessity: "x", risks: [risk({ residualLikelihood: 2, residualSeverity: 3 })] }).outcome).toBe("consultare_prealabila");
  });
  it("lipsuri: necesitatea, riscurile, măsurile, rezidual mai mare decât inițial", () => {
    expect(assessDpia({ necessity: "", risks: [] }).missing).toHaveLength(2);
    expect(assessDpia({ necessity: "x", risks: [risk({ measures: " " })] }).missing[0]).toMatch(/măsuri/);
    expect(assessDpia({ necessity: "x", risks: [risk({ residualLikelihood: 3 })] }).missing.join(" ")).toMatch(/nu poate fi mai mare/);
  });
  it("riscuri propuse după activitate", () => {
    const basic = suggestDpiaRisks(base).map((r) => r.title);
    expect(basic).toHaveLength(3);
    const ai = suggestDpiaRisks({ ...base, usesAi: true, systematicMonitoring: true, transferOutsideEea: true, subjectCategories: ["angajati"] }).map((r) => r.title);
    expect(ai).toEqual(expect.arrayContaining(["Decizii eronate sau discriminatorii", "Intruziune în viața privată", "Acces al autorităților dintr-o țară terță", "Dezechilibru de putere față de persoanele vizate"]));
  });
});
