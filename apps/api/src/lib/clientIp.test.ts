import { describe, expect, it } from "vitest";
import { pickForwarded } from "./clientIp";

describe("IP-ul clientului", () => {
  it("fără proxy de încredere, X-Forwarded-For e ignorat", () => {
    expect(pickForwarded("1.2.3.4", 0)).toBeNull();
  });
  it("ia adresa adăugată de cel mai îndepărtat proxy de încredere", () => {
    // clientul a falsificat „6.6.6.6”; marginea a adăugat IP-ul real, Next.js a adăugat marginea
    expect(pickForwarded("6.6.6.6, 81.2.3.4, 10.0.0.2", 2)).toBe("81.2.3.4");
    expect(pickForwarded("81.2.3.4", 1)).toBe("81.2.3.4");
  });
  it("mai puține adrese decât proxy-uri: prima", () => {
    expect(pickForwarded("81.2.3.4", 3)).toBe("81.2.3.4");
  });
});
