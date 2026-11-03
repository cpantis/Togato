import { describe, expect, it } from "vitest";
import { JUDETE, assessTool, buildSelfReport } from "./selfAssessment";
import { EMPTY_PORTAL_ANSWERS } from "./portal";

const tool = (id: string, answers: Partial<typeof EMPTY_PORTAL_ANSWERS>) => ({ id, name: id, vendor: null, purpose: null, answers: { ...EMPTY_PORTAL_ANSWERS, ...answers } });

describe("autoevaluarea", () => {
  it("instrumentele obișnuite: risc minim, fără avocat", () => {
    const r = assessTool({});
    expect(r.verdict).toBe("minim");
    expect(r.lawyerReason).toBeNull();
  });
  it("chatbotul: transparență", () => {
    expect(assessTool({ talksToPeople: true }).verdict).toBe("transparenta");
  });
  it("recrutarea și creditarea: risc ridicat, cu recomandarea unui avocat", () => {
    for (const a of [{ recruitment: true }, { creditScoring: true }, { employeeManagement: true }]) {
      const r = assessTool(a);
      expect(r.verdict).toBe("risc_ridicat");
      expect(r.lawyerReason).toBeTruthy();
      expect(r.obligations.length).toBeGreaterThan(3);
    }
  });
  it("biometria nu e niciodată „risc minim” într-o autoevaluare", () => {
    expect(assessTool({ biometrics: true }).verdict).toBe("de_verificat");
    expect(assessTool({ biometrics: true, talksToPeople: true }).verdict).toBe("de_verificat");
  });
  it("raportul: obligațiile generale apar o dată; avocat recomandat dacă un instrument o cere", () => {
    const empty = buildSelfReport([]);
    expect(empty.general).toEqual([]);
    const r = buildSelfReport([tool("ChatGPT", {}), tool("Chatbot", { talksToPeople: true })]);
    expect(r.general.map((o) => o.code)).toContain("art4_alfabetizare");
    expect(r.needsLawyer).toBe(false);
    expect(r.counts).toMatchObject({ minim: 1, transparenta: 1 });
    expect(buildSelfReport([tool("HR", { recruitment: true })]).needsLawyer).toBe(true);
  });
  it("lista județelor: 41 de județe + București", () => {
    expect(JUDETE).toHaveLength(42);
    expect(new Set(JUDETE).size).toBe(42);
  });
});
