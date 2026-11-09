import { describe, expect, it } from "vitest";
import { hasNul, isoDay } from "./validation";

describe("isoDay", () => {
  it("acceptă doar date existente", () => {
    expect(isoDay().safeParse("2026-02-28").success).toBe(true);
    expect(isoDay().safeParse("2028-02-29").success).toBe(true);
    for (const v of ["2026-02-30", "2026-13-01", "2026-00-10", "0000-01-01", "2026-1-1", "abc"]) expect(isoDay().safeParse(v).success).toBe(false);
  });
});

describe("hasNul", () => {
  it("găsește NUL escapat sau brut, nu și o bară escapată", () => {
    expect(hasNul(JSON.stringify({ a: "x\u0000y" }))).toBe(true);
    expect(hasNul('{"a":"x\u0000"}')).toBe(true);
    expect(hasNul(JSON.stringify({ a: "C:\\u0000 nu e NUL" }))).toBe(false);
    expect(hasNul(JSON.stringify({ a: "normal 100%00" }))).toBe(false);
  });
});
