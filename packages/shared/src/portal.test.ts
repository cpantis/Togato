import { describe, it, expect } from "vitest";
import { classifyAiSystem } from "./aiAct";
import { portalFlags, portalToAnswers, normalizePortalAnswers } from "./portal";

describe("portalToAnswers", () => {
  it("un instrument cumpărat, fără utilizări speciale = implementator, risc minim", () => {
    const a = portalToAnswers({});
    expect(a.role).toBe("implementator");
    expect(classifyAiSystem(a).riskLevel).toBe("minim");
  });

  it("recrutarea duce la risc ridicat, cu angajați și decizii despre persoane", () => {
    const a = portalToAnswers({ recruitment: true });
    expect(a.annexIII).toEqual(["4a_recrutare"]);
    expect(a.workplace).toBe(true);
    expect(a.decisionsOnPersons).toBe(true);
    expect(classifyAiSystem(a).riskLevel).toBe("risc_ridicat");
  });

  it("chatbot și conținut generat = transparență", () => {
    const a = portalToAnswers({ talksToPeople: true, generatesContent: true });
    expect(a.transparency).toEqual(["chatbot", "continut_sintetic"]);
    expect(classifyAiSystem(a).riskLevel).toBe("transparenta");
  });

  it("scoringul de credit cere FRIA", () => {
    const c = classifyAiSystem(portalToAnswers({ creditScoring: true }));
    expect(c.obligations.map((o) => o.code)).toContain("art27_fria");
  });

  it("dezvoltat în firmă = furnizor", () => {
    expect(portalToAnswers({ developedInHouse: true }).role).toBe("furnizor");
  });

  it("biometria nu se mapează automat, dar e semnalată avocatului", () => {
    const a = portalToAnswers({ biometrics: true });
    expect(a.prohibited).toEqual([]);
    expect(a.annexIII).toEqual([]);
    expect(portalFlags({ biometrics: true })).toHaveLength(1);
  });

  it("ignoră valori care nu sunt boolean și taie observațiile lungi", () => {
    const n = normalizePortalAnswers({ recruitment: "da" as any, notes: "x".repeat(5000) });
    expect(n.recruitment).toBe(false);
    expect(n.notes).toHaveLength(2000);
  });
});
