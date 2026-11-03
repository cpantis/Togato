/** Rotirea cheii de criptare pe date reale: recriptare idempotentă, 2FA funcțional după rotire. */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { rootDb } from "../src/db";
import { users } from "../src/db/schema";
import { _resetKeyCache, decryptDetailed, encrypt } from "../src/lib/crypto";
import { reencryptAll } from "../src/scripts/reencrypt";
import { base32Decode, hotp, timeStep } from "../src/lib/totp";
import { call, seedCabinet } from "./helpers";

const ORIGINAL = process.env.ENCRYPTION_KEY!;
const NEW_KEY = "a".repeat(64);
afterAll(() => { process.env.ENCRYPTION_KEY = ORIGINAL; delete process.env.ENCRYPTION_KEY_PREVIOUS; _resetKeyCache(); });

describe("rotirea ENCRYPTION_KEY", () => {
  it("secretele 2FA sunt recriptate cu cheia nouă, iar autentificarea în doi pași merge în continuare", async () => {
    const A = await seedCabinet("Rotire");
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    await rootDb.update(users).set({ totpEnabled: true, totpSecret: encrypt(secret) }).where(eq(users.id, A.userId));

    process.env.ENCRYPTION_KEY = NEW_KEY;
    process.env.ENCRYPTION_KEY_PREVIOUS = ORIGINAL;
    _resetKeyCache();
    const first = await reencryptAll();
    expect(first.rewritten).toBeGreaterThanOrEqual(1);
    expect(first.failed).toBe(0);
    const [u] = await rootDb.select().from(users).where(eq(users.id, A.userId));
    expect(decryptDetailed(u.totpSecret!)).toEqual({ plain: secret, key: "current" });
    expect((await reencryptAll()).rewritten).toBe(0); // idempotent

    // fără cheia veche: login cu cod TOTP funcționează
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    _resetKeyCache();
    const step1 = await call("POST", "/api/auth/login", { body: { email: A.email, password: "parola-sigura-1" } });
    const code = hotp(base32Decode(secret), timeStep());
    const step2 = await call("POST", "/api/auth/login/mfa", { body: { mfaToken: step1.body.mfaToken, code } });
    expect(step2.status).toBe(200);
  });
});
