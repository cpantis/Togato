/** Înregistrarea: confirmarea emailului (obligatorie în producție) și acceptarea termenilor, versionată. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { LEGAL_VERSION } from "@togato/shared";
import { rootDb } from "../src/db";
import { legalAcceptances, organizations, users } from "../src/db/schema";
import { _resetConfig } from "../src/config";
import { drain } from "../src/jobs/queue";
import { handlers } from "../src/jobs/handlers";
import { _clearOutbox, sentEmails } from "../src/services/email";
import { call, seedCabinet, unique } from "./helpers";

async function runJobs() {
  await rootDb.execute(sql`update jobs set run_at = now() where status = 'pending'`);
  await drain(handlers);
}
const signup = (email: string, extra: Record<string, unknown> = {}) =>
  call("POST", "/api/auth/signup", { body: { name: "Ana Pop", email, password: "parola-sigura-1", cabinetName: "Cabinet Nou", acceptTerms: true, legalVersion: LEGAL_VERSION, ...extra } });

beforeEach(async () => { await runJobs(); _clearOutbox(); });

describe("acceptarea termenilor la înregistrare", () => {
  it("obligatorie, în versiunea curentă; păstrată în istoric", async () => {
    expect((await signup(`${unique("t")}@x.ro`, { acceptTerms: false })).status).toBe(400);
    expect((await signup(`${unique("t")}@x.ro`, { legalVersion: "2000-01-01" })).status).toBe(409);
    const r = await signup(`${unique("t")}@x.ro`);
    expect(r.status).toBe(201);
    expect(r.body.organization).toMatchObject({ legalVersion: LEGAL_VERSION, legalCurrent: true });
    const hist = await rootDb.select().from(legalAcceptances).where(eq(legalAcceptances.organizationId, r.body.organization.id));
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ version: LEGAL_VERSION, userId: r.body.user.id });
  });

  it("la o versiune nouă: doar citire până la acceptarea de către un administrator", async () => {
    const A = await seedCabinet("Termeni Noi");
    await rootDb.update(organizations).set({ legalVersion: "2025-01-01" }).where(eq(organizations.id, A.organizationId));
    expect((await call("GET", "/api/auth/me", { token: A.token })).body.organization.legalCurrent).toBe(false);
    expect((await call("GET", "/api/clients", { token: A.token })).status).toBe(200);
    const blocked = await call("POST", "/api/clients", { token: A.token, body: { name: "Blocat SRL" } });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("terms_required");
    expect((await call("POST", "/api/organization/legal/accept", { token: A.token, body: { version: "2025-01-01" } })).status).toBe(409);
    expect((await call("POST", "/api/organization/legal/accept", { token: A.token, body: { version: LEGAL_VERSION } })).body.legalCurrent).toBe(true);
    expect((await call("POST", "/api/clients", { token: A.token, body: { name: "Deblocat SRL" } })).status).toBe(201);
  });
});

describe("confirmarea emailului (activată ca în producție)", () => {
  beforeAll(() => { process.env.REQUIRE_EMAIL_VERIFICATION = "on"; _resetConfig(); });
  afterAll(() => { delete process.env.REQUIRE_EMAIL_VERIFICATION; _resetConfig(); });

  it("contul nou e blocat până la confirmare; retrimitere; linkul se folosește o dată", async () => {
    const email = `${unique("v")}@x.ro`;
    const r = await signup(email);
    expect(r.body.user.emailVerified).toBe(false);
    const blocked = await call("GET", "/api/dashboard", { token: r.body.token });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("email_unverified");

    await runJobs();
    const first = sentEmails().find((m) => m.to === email)!.text.match(/confirmare-email\/([A-Za-z0-9_-]+)/)![1];
    _clearOutbox();
    expect((await call("POST", "/api/account/resend-verification", { token: r.body.token })).body.verified).toBe(false);
    await runJobs();
    const second = sentEmails().find((m) => m.to === email)!.text.match(/confirmare-email\/([A-Za-z0-9_-]+)/)![1];
    expect((await call("POST", "/api/auth/verify-email", { body: { token: first } })).status).toBe(400); // înlocuit
    expect((await call("POST", "/api/auth/verify-email", { body: { token: second } })).status).toBe(200);
    expect((await call("POST", "/api/auth/verify-email", { body: { token: second } })).status).toBe(400);
    expect((await call("GET", "/api/dashboard", { token: r.body.token })).status).toBe(200);
    expect((await call("GET", "/api/auth/me", { token: r.body.token })).body.user.emailVerified).toBe(true);
  });

  it("colegii invitați au adresa confirmată prin invitație", async () => {
    const A = await seedCabinet("Invitație Confirmată");
    await rootDb.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, A.userId));
    const inv = await call("POST", "/api/team/invitations", { token: A.token, body: { email: `${unique("c")}@x.ro`, sendEmail: false } });
    const acc = await call("POST", "/api/auth/accept-invitation", { body: { token: inv.body.url.split("/invite/")[1], name: "Coleg Nou", password: "parola-coleg-1" } });
    expect(acc.body.user.emailVerified).toBe(true);
    expect((await call("GET", "/api/dashboard", { token: acc.body.token })).status).toBe(200);
  });
});

describe("perioada de probă și 2FA pentru administratori", () => {
  it("emailuri cu 7 zile și 1 zi înainte și la expirare, o singură dată fiecare", async () => {
    const { trialReminderKind } = await import("../src/jobs/handlers");
    const now = new Date("2026-11-10T10:00:00Z");
    const at = (days: number) => new Date(now.getTime() + days * 86400_000);
    expect(trialReminderKind(at(10), now)).toBeNull();
    expect(trialReminderKind(at(6.5), now)).toBe("7");
    expect(trialReminderKind(at(0.5), now)).toBe("1");
    expect(trialReminderKind(at(-1), now)).toBe("expirat");
    expect(trialReminderKind(at(-5), now)).toBeNull();

    const A = await seedCabinet("Probă");
    await rootDb.update(organizations).set({ trialEndsAt: new Date(Date.now() + 5 * 86400_000) }).where(eq(organizations.id, A.organizationId));
    await handlers["trial.reminders"]({}, { id: "x", attempts: 1, type: "trial.reminders" });
    await handlers["trial.reminders"]({}, { id: "x", attempts: 1, type: "trial.reminders" });
    await runJobs();
    const mails = sentEmails().filter((m) => m.to === A.email && m.subject.includes("probă"));
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("Perioada de probă Togato se încheie în 5 zile");
  });

  it("cu politica activă, administratorul fără 2FA trebuie să o activeze", async () => {
    const A = await seedCabinet("Admin 2FA");
    process.env.REQUIRE_ADMIN_2FA = "on"; _resetConfig();
    try {
      const me = await call("GET", "/api/auth/me", { token: A.token });
      expect(me.body.user.twoFactorRequired).toBe(true);
      const r = await call("GET", "/api/dashboard", { token: A.token });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("2fa_required");
      expect((await call("GET", "/api/account/security", { token: A.token })).status).toBe(200);
      await rootDb.update(users).set({ totpEnabled: true }).where(eq(users.id, A.userId));
      expect((await call("GET", "/api/dashboard", { token: A.token })).status).toBe(200);
    } finally {
      delete process.env.REQUIRE_ADMIN_2FA; _resetConfig();
    }
  });
});

describe("clientul demonstrativ", () => {
  it("trei sisteme încadrate automat, o singură dată, în afara limitelor planului", async () => {
    const A = await seedCabinet("Demo Cabinet");
    const r = await call("POST", "/api/clients/demo", { token: A.token });
    expect(r.status).toBe(201);
    const again = await call("POST", "/api/clients/demo", { token: A.token });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(r.body.id);
    const c = await call("GET", `/api/clients/${r.body.id}`, { token: A.token });
    expect(c.body.isDemo).toBe(true);
    expect(c.body.aiSystems.map((s: { riskLevel: string }) => s.riskLevel).sort()).toEqual(["minim", "risc_ridicat", "transparenta"]);
    expect(c.body.aiSystems.every((s: { reviewStatus: string }) => s.reviewStatus === "propus")).toBe(true);
    const billing = await call("GET", "/api/billing", { token: A.token });
    expect(billing.body.usage.activeClients).toBe(1);
  });
});
