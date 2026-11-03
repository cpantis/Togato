import { describe, expect, it } from "vitest";
import { contentDisposition, detectKind, safeFilename } from "./files";
import { csvCell, toCsv } from "../dossierExport";

const b = (...bytes: number[]) => Buffer.from(bytes);

describe("tipul fișierelor încărcate", () => {
  it("se stabilește din conținut, nu din extensie", () => {
    expect(detectKind(Buffer.from("%PDF-1.7 ..."), "x.pdf")).toBe("pdf");
    expect(detectKind(Buffer.from("%PDF-1.7 ..."), "x.exe")).toBe("pdf");
    expect(detectKind(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), "a.png")).toBe("png");
    expect(detectKind(b(0xff, 0xd8, 0xff, 0xe0), "a.jpg")).toBe("jpeg");
    expect(detectKind(Buffer.from("<html><script>alert(1)</script>"), "dovada.pdf")).toBeNull();
    expect(detectKind(Buffer.from("<svg onload=alert(1)>"), "logo.svg")).toBeNull();
    expect(detectKind(b(0x4d, 0x5a, 0x90, 0), "program.exe")).toBeNull();
  });
  it("containerele ZIP sunt acceptate doar ca documente Office/ODF", () => {
    const zip = b(0x50, 0x4b, 0x03, 0x04, 1, 2, 3);
    expect(detectKind(zip, "contract.docx")).toBe("docx");
    expect(detectKind(zip, "tabel.xlsx")).toBe("xlsx");
    expect(detectKind(zip, "arhiva.zip")).toBeNull();
  });
  it("text doar dacă e UTF-8 valid, fără octeți nuli", () => {
    expect(detectKind(Buffer.from("nume,valoare\nă,1\n"), "date.csv")).toBe("csv");
    expect(detectKind(b(0x61, 0x00, 0x62), "date.txt")).toBeNull();
  });
  it("numele fișierului e curățat; antetul de descărcare e sigur", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename('a"b<c>.pdf')).toBe("abc.pdf");
    expect(contentDisposition("Proces-verbal ședință.pdf")).toContain("filename*=UTF-8''Proces-verbal%20%C8%99edin%C8%9B%C4%83.pdf");
    expect(contentDisposition("Proces-verbal ședință.pdf")).toContain('filename="Proces-verbal sedinta.pdf"');
  });
});

describe("CSV", () => {
  it("previne injectarea de formule în Excel", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+40 123")).toBe("'+40 123");
    expect(csvCell("text, cu virgulă")).toBe('"text, cu virgulă"');
    expect(csvCell(null)).toBe("");
  });
  it("începe cu BOM (diacritice corecte în Excel)", () => {
    expect(toCsv(["a"], [["ș"]]).charCodeAt(0)).toBe(0xfeff);
  });
});
