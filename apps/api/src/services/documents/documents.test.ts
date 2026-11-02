import { describe, it, expect } from "vitest";
import { classifyAiSystem, normalizeAnswers, CLIENT_OBLIGATIONS, type AiSystemAnswers } from "@togato/shared";
import type { DocContext, DocSystem } from "./common";
import { listDocuments, renderDocument } from "./index";


let seq = 0;
function system(name: string, answers: Partial<AiSystemAnswers>): DocSystem {
  const a = normalizeAnswers(answers);
  const c = classifyAiSystem(a);
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  return {
    id, name, vendor: "Furnizor", description: null, purpose: null, department: null, answers: a,
    riskLevel: c.riskLevel, classification: c, reviewStatus: "propus", reviewedByName: null, reviewedAt: null,
    obligations: c.obligations.map((t, i) => ({
      id: `${id}-${i}`, organizationId: "o", clientId: "c", aiSystemId: id, code: t.code, article: t.article, title: t.title,
      description: t.description, appliesFrom: t.appliesFrom, recommended: !!t.recommended, status: "de_facut" as const, note: null,
      dueDate: null, completedAt: null, updatedBy: null, createdAt: new Date(), updatedAt: new Date(),
    })),
  };
}

function ctx(systems: DocSystem[]): DocContext {
  return {
    cabinetName: "Cabinet Test", preparedBy: "Ana", generatedAt: new Date("2026-11-02T10:00:00Z"),
    client: { id: "c", organizationId: "o", name: "Client Ă Ș Ț SRL", cui: "14399840" } as DocContext["client"],
    responsibleName: "Ana",
    systems,
    clientObligations: systems.length ? CLIENT_OBLIGATIONS.map((t, i) => ({
      id: `co-${i}`, organizationId: "o", clientId: "c", aiSystemId: null, code: t.code, article: t.article, title: t.title,
      description: t.description, appliesFrom: t.appliesFrom, recommended: !!t.recommended, status: "de_facut" as const, note: null,
      dueDate: null, completedAt: null, updatedBy: null, createdAt: new Date(), updatedAt: new Date(),
    })) : [],
  };
}

describe("documente", () => {
  it("fără sisteme AI, niciun document nu e disponibil", async () => {
    const list = listDocuments(ctx([]));
    expect(list.every((d) => !d.available)).toBe(true);
    const r = await renderDocument(ctx([]), "raport");
    expect("error" in r).toBe(true);
  });

  it("notificarea și FRIA apar doar pentru sistemele cu obligația respectivă", () => {
    const cv = system("CV", { annexIII: ["4a_recrutare"], workplace: true });
    const credit = system("Credit", { annexIII: ["5b_scoring_credit"] });
    const chat = system("Chat", {});
    const list = listDocuments(ctx([cv, credit, chat]));
    expect(list.find((d) => d.type === "notificare_angajati")!.systems.map((s) => s.name)).toEqual(["CV"]);
    expect(list.find((d) => d.type === "fria")!.systems.map((s) => s.name)).toEqual(["Credit"]);
  });

  it("generează fișiere .docx valide pentru toate tipurile", async () => {
    const cv = system("Filtrare CV", { annexIII: ["4a_recrutare"], workplace: true, decisionsOnPersons: true });
    const credit = system("Scoring", { annexIII: ["5b_scoring_credit"] });
    const banned = system("Emoții", { prohibited: ["5f_emotii_munca_scoala"] });
    const c = ctx([cv, credit, banned]);
    for (const [type, sys] of [["raport"], ["registru"], ["politica"], ["notificare_angajati", cv.id], ["fria", credit.id]] as const) {
      const r = await renderDocument(c, type, sys);
      if ("error" in r) throw new Error(`${type}: ${r.error}`);
      expect(r.buffer.subarray(0, 2).toString()).toBe("PK"); // arhivă ZIP (OOXML)
      expect(r.buffer.length).toBeGreaterThan(5000);
      expect(r.filename).toMatch(/^[A-Za-z0-9_-]+\.docx$/); // fără diacritice în numele fișierului
    }
  });

  it("refuză un sistem care nu are obligația și tipurile necunoscute", async () => {
    const chat = system("Chat", {});
    expect("error" in (await renderDocument(ctx([chat]), "fria", chat.id))).toBe(true);
    expect("error" in (await renderDocument(ctx([chat]), "inexistent"))).toBe(true);
  });
});
