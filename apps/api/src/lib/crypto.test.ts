import { afterEach, describe, expect, it } from "vitest";
import { _resetKeyCache, decrypt, decryptDetailed, encrypt } from "./crypto";

const K1 = "1".repeat(64);
const K2 = "2".repeat(64);

function useKeys(current: string, previous?: string) {
  process.env.ENCRYPTION_KEY = current;
  if (previous) process.env.ENCRYPTION_KEY_PREVIOUS = previous; else delete process.env.ENCRYPTION_KEY_PREVIOUS;
  _resetKeyCache();
}
afterEach(() => { delete process.env.ENCRYPTION_KEY; delete process.env.ENCRYPTION_KEY_PREVIOUS; _resetKeyCache(); });

describe("rotirea cheii de criptare", () => {
  it("după rotire, datele vechi se citesc cu cheia anterioară și sunt marcate pentru recriptare", () => {
    useKeys(K1);
    const old = encrypt("JBSWY3DPEHPK3PXP");
    useKeys(K2, K1);
    expect(decryptDetailed(old)).toEqual({ plain: "JBSWY3DPEHPK3PXP", key: "previous" });
    const fresh = encrypt("JBSWY3DPEHPK3PXP");
    expect(decryptDetailed(fresh).key).toBe("current");
  });
  it("fără cheia veche, datele vechi nu mai pot fi citite (GCM respinge cheia greșită)", () => {
    useKeys(K1);
    const old = encrypt("secret");
    useKeys(K2);
    expect(() => decrypt(old)).toThrow();
  });
  it("cheile trebuie să fie 64 de caractere hex", () => {
    useKeys("zz".repeat(32));
    expect(() => encrypt("x")).toThrow(/64 de caractere hex/);
  });
});
