import { describe, it, expect } from "vitest";
import { classifyAiSystem, type ClassificationResult } from "./aiAct";
import { RULESET_CHANGELOG, RULESET_VERSION, changesSince, compareClassifications, planReclassification } from "./legislation";

const HR = { annexIII: ["4a_recrutare"], workplace: true };
const clone = (c: ClassificationResult): ClassificationResult => JSON.parse(JSON.stringify(c));

/** Simulează o încadrare salvată pe vechile reguli dinainte de Omnibus (risc ridicat din aug. 2026). */
function preOmnibus(c: ClassificationResult): ClassificationResult {
  const old = clone(c);
  old.obligations = old.obligations.map((o) => (o.appliesFrom === "2027-12-02" ? { ...o, appliesFrom: "2026-08-02" } : o));
  return old;
}

describe("versiuni", () => {
  it("versiunea curentă e prima din istoric, în format AAAA.N", () => {
    expect(RULESET_VERSION).toBe(RULESET_CHANGELOG[0].version);
    for (const c of RULESET_CHANGELOG) expect(c.version).toMatch(/^\d{4}\.\d+$/);
  });
  it("changesSince întoarce doar modificările mai noi", () => {
    expect(changesSince(RULESET_VERSION)).toEqual([]);
    expect(changesSince(null)).toEqual(RULESET_CHANGELOG);
    expect(changesSince("inexistent")).toEqual(RULESET_CHANGELOG);
  });
});

describe("compareClassifications", () => {
  it("aceleași reguli = identic", () => {
    const c = classifyAiSystem(HR);
    const d = compareClassifications(clone(c), c);
    expect(d.identical).toBe(true);
    expect(d.significant).toBe(false);
  });

  it("doar termene mutate = schimbare minoră, fără reverificare", () => {
    const now = classifyAiSystem(HR);
    const d = compareClassifications(preOmnibus(now), now);
    expect(d.significant).toBe(false);
    expect(d.datesChanged.length).toBeGreaterThan(0);
    expect(d.datesChanged[0]).toMatchObject({ from: "2026-08-02", to: "2027-12-02" });
  });

  it("o obligație nouă în lege = schimbare de fond", () => {
    const now = classifyAiSystem(HR);
    const old = clone(now);
    old.obligations = old.obligations.filter((o) => o.code !== "art26_7_angajati");
    const d = compareClassifications(old, now);
    expect(d.significant).toBe(true);
    expect(d.added.map((o) => o.code)).toEqual(["art26_7_angajati"]);
  });

  it("schimbarea nivelului de risc = schimbare de fond", () => {
    const now = classifyAiSystem(HR);
    const old = { ...clone(now), riskLevel: "minim" as const, highRiskBasis: null };
    const d = compareClassifications(old, now);
    expect(d.riskChanged).toEqual({ from: "minim", to: "risc_ridicat" });
  });
});

describe("planReclassification", () => {
  it("termenele se actualizează fără a trimite sistemul la verificare", () => {
    const now = classifyAiSystem(HR);
    const plan = planReclassification({ answers: HR, stored: preOmnibus(now), riskOverride: null, fromVersion: "2025.9" });
    expect(plan.needsReview).toBe(false);
    expect(plan.note).toBeNull();
    expect(plan.classification.obligations.find((o) => o.code === "art26_2_supraveghere")!.appliesFrom).toBe("2027-12-02");
  });

  it("o schimbare de fond produce o notă cu versiunea și diferențele", () => {
    const now = classifyAiSystem(HR);
    const old = clone(now);
    old.obligations = old.obligations.filter((o) => o.code !== "art26_6_jurnale");
    const plan = planReclassification({ answers: HR, stored: old, riskOverride: null, fromVersion: "2025.9" });
    expect(plan.needsReview).toBe(true);
    expect(plan.note).toContain("Reîncadrat după actualizarea legislației");
    expect(plan.note).toContain(RULESET_VERSION);
    expect(plan.note).toContain("Art. 26(6)");
  });

  it("încadrarea manuală a avocatului e păstrată și conflictul e semnalat", () => {
    const now = classifyAiSystem(HR);
    const old = { ...clone(now), riskLevel: "minim" as const, highRiskBasis: null };
    const plan = planReclassification({ answers: HR, stored: old, riskOverride: "minim", fromVersion: "2025.9" });
    expect(plan.riskLevel).toBe("minim");
    expect(plan.overrideConflict).toBe(true);
    expect(plan.note).toContain("Încadrarea manuală a avocatului");
  });

  it("fără încadrare manuală, se salvează nivelul calculat", () => {
    const plan = planReclassification({ answers: HR, stored: null, riskOverride: null, fromVersion: null });
    expect(plan.riskLevel).toBe("risc_ridicat");
  });
});
