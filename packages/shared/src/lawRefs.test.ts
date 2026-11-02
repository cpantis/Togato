import { describe, it, expect } from "vitest";
import { parseLawRefs } from "./lawRefs";

describe("parseLawRefs", () => {
  it("articol, alineat și literă", () => {
    expect(parseLawRefs("Art. 5(1)(f)")).toEqual([{ kind: "article", article: "5", paragraph: "1", point: "f", label: "Art. 5(1)(f)" }]);
    expect(parseLawRefs("Art. 4")[0]).toMatchObject({ article: "4", paragraph: undefined });
    expect(parseLawRefs("Art. 26 alin. (7)")[0]).toMatchObject({ article: "26", paragraph: "7" });
    expect(parseLawRefs("Art. 3 pct. 1")[0]).toMatchObject({ article: "3", paragraph: "1" });
  });
  it("anexe", () => {
    expect(parseLawRefs("Anexa III pct. 4(a)")[0]).toMatchObject({ kind: "annex", annex: "III", item: "4", point: "a" });
    expect(parseLawRefs("Anexa III pct. 2")[0]).toMatchObject({ kind: "annex", annex: "III", item: "2", point: undefined });
  });
  it("trimiteri combinate și externe", () => {
    const r = parseLawRefs("Art. 26(9) + GDPR Art. 35");
    expect(r.map((x) => x.kind)).toEqual(["article", "external"]);
    expect(parseLawRefs("Art. 11 + Anexa IV").map((x) => x.kind)).toEqual(["article", "annex"]);
    expect(parseLawRefs("Art. 6(3) ultimul paragraf")[0]).toMatchObject({ article: "6", paragraph: "3" });
  });
  it("fără trimiteri", () => {
    expect(parseLawRefs("Bună practică")).toEqual([]);
    expect(parseLawRefs("—")).toEqual([]);
  });
});
