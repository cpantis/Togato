import { describe, expect, it } from "vitest";
import { addMonths, breachDeadline, breachDuties, checkProcessing, dsarDueDate, type ProcessingInput } from "./gdpr";

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
