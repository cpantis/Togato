/** Fluxurile principale, pe baza de date reală. */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { base32Decode, hotp, timeStep } from "../src/lib/totp";
import { reclassifyOutdated } from "../src/services/reclassify";
import { RULESET_VERSION } from "@togato/shared";
import { call, seedCabinet, unique } from "./helpers";
import { app } from "../src/app";

const totp = (secret: string, offset = 0) => hotp(base32Decode(secret), timeStep() + offset);

describe("autentificare", () => {
  it("înregistrare, login, parolă greșită, cont dezactivat", async () => {
    const email = `${unique("u")}@x.ro`;
    const s = await call("POST", "/api/auth/signup", { body: { name: "Ana", email, password: "parola-sigura-1", cabinetName: "Cab" } });
    expect(s.status).toBe(201);
    expect((await call("POST", "/api/auth/signup", { body: { name: "Ana", email, password: "parola-sigura-1", cabinetName: "Cab" } })).status).toBe(409);
    expect((await call("POST", "/api/auth/login", { body: { email, password: "gresit" } })).status).toBe(401);
    const ok = await call("POST", "/api/auth/login", { body: { email: email.toUpperCase(), password: "parola-sigura-1" } });
    expect(ok.status).toBe(200);
    expect((await call("GET", "/api/auth/me", { token: ok.body.token })).body.user.email).toBe(email);
  });

  it("autentificare în doi pași cap-coadă", async () => {
    const c = await seedCabinet("Doi Pasi");
    const setup = await call("POST", "/api/account/2fa/setup", { token: c.token });
    const en = await call("POST", "/api/account/2fa/enable", { token: c.token, body: { code: totp(setup.body.secret) } });
    expect(en.body.recoveryCodes).toHaveLength(8);
    const l = await call("POST", "/api/auth/login", { body: { email: c.email, password: "parola-sigura-1" } });
    expect(l.body.mfaRequired).toBe(true);
    expect((await call("GET", "/api/clients", { token: l.body.mfaToken })).status).toBe(401);
    const code = totp(setup.body.secret, 1);
    expect((await call("POST", "/api/auth/login/mfa", { body: { mfaToken: l.body.mfaToken, code } })).status).toBe(200);
    expect((await call("POST", "/api/auth/login/mfa", { body: { mfaToken: l.body.mfaToken, code } })).status).toBe(401);
    const rc = en.body.recoveryCodes[0];
    expect((await call("POST", "/api/auth/login/mfa", { body: { mfaToken: l.body.mfaToken, code: rc } })).status).toBe(200);
    expect((await call("POST", "/api/auth/login/mfa", { body: { mfaToken: l.body.mfaToken, code: rc } })).status).toBe(401);
  });
});

describe("legislație și avize", () => {
  it("reîncadrarea după o versiune nouă a regulilor păstrează munca avocatului", async () => {
    const c = await seedCabinet("Reincadrare");
    const sys = await call("GET", `/api/ai-systems/${c.systemId}`, { token: c.token });
    const target = sys.body.obligations.find((o: any) => o.code === "art26_2_supraveghere");
    await call("PATCH", `/api/obligations/${target.id}`, { token: c.token, body: { status: "indeplinit", note: "Desemnat dl. Pop" } });
    // simulăm o încadrare pe reguli vechi, căreia îi lipsea o obligație
    await db.execute(sql`update ai_systems set ruleset_version = '2000.1',
      classification = jsonb_set(classification, '{obligations}', (select jsonb_agg(o) from jsonb_array_elements(classification->'obligations') o where o->>'code' <> 'art26_7_angajati'))
      where id = ${c.systemId}`);
    await db.execute(sql`delete from obligations where ai_system_id = ${c.systemId} and code = 'art26_7_angajati'`);
    const report = await reclassifyOutdated();
    expect(report.needsReview).toBeGreaterThanOrEqual(1);
    const after = await call("GET", `/api/ai-systems/${c.systemId}`, { token: c.token });
    expect(after.body.rulesetVersion).toBe(RULESET_VERSION);
    expect(after.body.reviewStatus).toBe("propus");
    expect(after.body.reclassNote).toContain("Art. 26(7)");
    const kept = after.body.obligations.find((o: any) => o.code === "art26_2_supraveghere");
    expect(kept).toMatchObject({ status: "indeplinit", note: "Desemnat dl. Pop" });
  });

  it("avizul e imuabil, iar o modificare directă în baza de date e detectată", async () => {
    const c = await seedCabinet("Aviz");
    await call("PUT", `/api/ai-systems/${c.systemId}`, { token: c.token, body: { name: "Alt nume", answers: { qualification: "da" } } });
    const pdf = await call("GET", `/api/snapshots/${c.snapshotId}/pdf`, { token: c.token });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("x-togato-integrity")).toBe("ok");
    await db.execute(sql`update analysis_snapshots set data = jsonb_set(data, '{riskLevel}', '"minim"') where id = ${c.snapshotId}`);
    const tampered = await call("GET", `/api/snapshots/${c.snapshotId}/pdf`, { token: c.token });
    expect(tampered.headers.get("x-togato-integrity")).toBe("modified");
  });
});

describe("portalul clientului", () => {
  it("trimiterea din portal ajunge la cabinet ca încadrare propusă", async () => {
    const c = await seedCabinet("Portal");
    const token = c.portalUrl.split("/").pop()!;
    const sub = await call("POST", `/api/portal/${token}/systems`, { body: { name: "Chatbot site", contactName: "Paul", answers: { talksToPeople: true } } });
    expect(sub.status).toBe(201);
    const sys = await call("GET", `/api/ai-systems/${sub.body.id}`, { token: c.token });
    expect(sys.body).toMatchObject({ source: "portal", riskLevel: "transparenta", reviewStatus: "propus", submittedByName: "Paul" });
  });
});

describe("operațional", () => {
  it("/health/ready verifică baza de date; fiecare răspuns are X-Request-Id", async () => {
    const r = await call("GET", "/health/ready");
    expect(r.status).toBe(200);
    expect((r.body as any).db).toBe("ok");
    const r2 = await app.request("/api/dashboard", { headers: { "x-request-id": "cerere-test-123" } });
    expect(r2.headers.get("x-request-id")).toBe("cerere-test-123");
    const r3 = await app.request("/api/dashboard");
    expect(r3.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
