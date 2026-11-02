import { describe, it, expect, beforeAll } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, generateSecret, hashRecoveryCode, hotp, otpauthUri, timeStep, verifyTotp } from "./totp";
import { _resetKeyCache, decrypt, encrypt } from "./crypto";

// RFC 6238, Anexa B: secret ASCII „12345678901234567890”, SHA1, 8 cifre
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("TOTP — vectorii de test RFC 6238", () => {
  const vectors: [number, string][] = [
    [59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"],
    [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"],
  ];
  for (const [t, expected] of vectors) {
    it(`T=${t}`, () => expect(hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(expected));
  }
});

describe("verifyTotp", () => {
  const secret = base32Encode(RFC_SECRET);
  const now = 1111111111_000;
  const code = hotp(RFC_SECRET, timeStep(now));

  it("acceptă codul curent și pe cel din pasul vecin", () => {
    expect(verifyTotp(secret, code, { nowMs: now })).toBe(timeStep(now));
    expect(verifyTotp(secret, code, { nowMs: now + 30_000 })).toBe(timeStep(now));
  });
  it("respinge codurile vechi, greșite sau malformate", () => {
    expect(verifyTotp(secret, code, { nowMs: now + 90_000 })).toBeNull();
    expect(verifyTotp(secret, "000000", { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, "12345", { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, "abcdef", { nowMs: now })).toBeNull();
  });
  it("nu permite refolosirea aceluiași cod", () => {
    const step = verifyTotp(secret, code, { nowMs: now })!;
    expect(verifyTotp(secret, code, { nowMs: now, lastStep: step })).toBeNull();
  });
});

describe("utilitare", () => {
  it("base32 dus-întors și secret de 160 de biți", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s)).toHaveLength(20);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });
  it("URI otpauth pentru aplicațiile de autentificare", () => {
    expect(otpauthUri("ABC", "ana@cabinet.ro")).toBe("otpauth://totp/Togato%3Aana%40cabinet.ro?secret=ABC&issuer=Togato&algorithm=SHA1&digits=6&period=30");
  });
  it("coduri de recuperare unice, hash independent de majuscule și spații", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(hashRecoveryCode(codes[0].toLowerCase())).toBe(hashRecoveryCode(` ${codes[0]} `));
  });
});

describe("criptare", () => {
  beforeAll(() => { process.env.JWT_SECRET = "secret-de-test"; delete process.env.ENCRYPTION_KEY; _resetKeyCache(); });
  it("criptează și decriptează, cu IV diferit la fiecare apel", () => {
    const a = encrypt("JBSWY3DPEHPK3PXP");
    expect(a).not.toContain("JBSWY3DPEHPK3PXP");
    expect(encrypt("JBSWY3DPEHPK3PXP")).not.toBe(a);
    expect(decrypt(a)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("detectează un text criptat modificat", () => {
    const parts = encrypt("secret").split(":");
    parts[3] = Buffer.from("altceva").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
});
