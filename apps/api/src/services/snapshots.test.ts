import { describe, it, expect } from "vitest";
import { classifyAiSystem, normalizeAnswers } from "@togato/shared";
import { canonicalJson, renderSnapshotPdf, snapshotHash, verifySnapshot, type SnapshotData } from "./snapshots";

function data(): SnapshotData {
  const answers = normalizeAnswers({ qualification: "da", annexIII: ["4a_recrutare"], workplace: true, decisionsOnPersons: true });
  const classification = classifyAiSystem(answers);
  return {
    cabinet: { name: "Ionescu & Partenerii" },
    client: { name: "Țesătoria Șoimul SRL", cui: "14399840", caen: "1310" },
    system: { name: "Filtrare CV-uri", vendor: "HireSmart", description: "Selectează candidații", purpose: "Recrutare", department: "HR", source: "cabinet" },
    answers, classification, riskLevel: classification.riskLevel, override: null,
    review: { status: "aprobat", note: "Încadrare confirmată.", by: "Ana Popescu", at: "2026-11-02T10:00:00.000Z" },
    obligations: classification.obligations.map((o) => ({ article: o.article, title: o.title, appliesFrom: o.appliesFrom, status: "de_facut" as const, note: null, dueDate: null })),
    memo: { text: "## Încadrare\\nRisc ridicat[1].", citations: [{ n: 1, ref: "Anexa III pct. 4", quote: "(a) sisteme de IA destinate recrutării" }], generatedAt: null },
  };
}

const meta = { version: 1, rulesetVersion: "2026.4", lawTextVersion: "32024R1689", createdAt: "2026-11-02T10:00:00.000Z", createdByName: "Ana Popescu", reason: "aprobarea încadrării" };

describe("amprenta instantaneului", () => {
  it("JSON-ul canonic nu depinde de ordinea cheilor", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe(canonicalJson({ a: { c: null, d: [2, { x: 2, y: 1 }] }, b: 1 }));
  });

  it("aceeași analiză dă aceeași amprentă; orice modificare o schimbă", () => {
    const d = data();
    const h = snapshotHash(meta, d);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshotHash(meta, JSON.parse(JSON.stringify(d)))).toBe(h);
    const altered = data();
    altered.obligations[0].status = "indeplinit";
    expect(snapshotHash(meta, altered)).not.toBe(h);
    expect(snapshotHash({ ...meta, createdByName: "Altcineva" }, d)).not.toBe(h);
  });

  it("verifySnapshot detectează un rând modificat după salvare", () => {
    const d = data();
    const row = { ...meta, createdAt: new Date(meta.createdAt), data: d, sha256: snapshotHash(meta, d) } as any;
    expect(verifySnapshot(row)).toBe(true);
    expect(verifySnapshot({ ...row, data: { ...d, riskLevel: "minim" } })).toBe(false);
  });
});

describe("PDF", () => {
  it("generează un PDF valid, pe mai multe pagini pentru multe obligații", async () => {
    const d = data();
    d.obligations = [...d.obligations, ...d.obligations, ...d.obligations];
    const pdf = await renderSnapshotPdf({ ...meta, createdAt: new Date(meta.createdAt), data: d, sha256: snapshotHash(meta, d) });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pages).toBeGreaterThan(1);
  });
});
