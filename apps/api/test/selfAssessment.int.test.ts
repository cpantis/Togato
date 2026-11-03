/** Autoevaluarea gratuită → directorul cabinetelor → solicitare → acceptare / refuz. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { ZodTypeAny } from "zod";
import { rootDb } from "../src/db";
import { aiSystems, organizations } from "../src/db/schema";
import { drain } from "../src/jobs/queue";
import { handlers } from "../src/jobs/handlers";
import { _clearOutbox, sentEmails } from "../src/services/email";
import * as C from "./contracts";
import { call, seedCabinet, unique, verifySelfAssessment } from "./helpers";

async function runJobs() {
  await rootDb.execute(sql`update jobs set run_at = now() where status = 'pending'`);
  await drain(handlers);
}
function check(schema: ZodTypeAny, body: unknown) {
  const r = schema.safeParse(body);
  if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
}
async function newAssessment(overrides: Record<string, unknown> = {}, opts: { verify?: boolean } = { verify: true }) {
  const email = `${unique("firma")}@firma.ro`;
  const r = await call("POST", "/api/self-assessments", { body: { companyName: "Transport Rapid SRL", county: "Cluj", contactName: "Maria Ionescu", contactEmail: email, terms: true, ...overrides } });
  if (r.status === 201 && opts.verify) await verifySelfAssessment(r.body.token);
  return { ...r, email };
}
const linkIn = (text: string) => text.match(/\/autoevaluare\/([A-Za-z0-9_-]+)(?:\?confirmare=([A-Za-z0-9_-]+))?/)!;

beforeEach(async () => { await runJobs(); _clearOutbox(); });

describe("autoevaluarea gratuită", () => {
  it("se creează fără cont, cu acceptul informării; linkul pleacă pe email; roboții sunt refuzați", async () => {
    expect((await newAssessment({ terms: false })).status).toBe(400);
    expect((await newAssessment({ website: "http://spam" })).status).toBe(400);
    expect((await newAssessment({ county: "Atlantida" })).status).toBe(400);
    const r = await newAssessment();
    expect(r.status).toBe(201);
    await runJobs();
    const mail = sentEmails().find((m) => m.to === r.email)!;
    expect(mail.text).toContain(`/autoevaluare/${r.body.token}`);
    expect((await call("GET", "/api/self-assessments/inexistent-dar-destul-de-lung-1234")).status).toBe(404);
  });

  it("instrumente → rezultat orientativ; biometria cere avocat; ștergerea unui instrument", async () => {
    const { body } = await newAssessment();
    const t = body.token;
    await call("POST", `/api/self-assessments/${t}/tools`, { body: { name: "ChatGPT", vendor: "OpenAI" } });
    await call("POST", `/api/self-assessments/${t}/tools`, { body: { name: "Selecție CV", answers: { recruitment: true } } });
    const r = await call("POST", `/api/self-assessments/${t}/tools`, { body: { name: "Camere cu recunoaștere facială", answers: { biometrics: true } } });
    check(C.selfAssessment, r.body);
    expect(r.body.report.tools.map((x: any) => x.result.verdict)).toEqual(["minim", "risc_ridicat", "de_verificat"]);
    expect(r.body.report.needsLawyer).toBe(true);
    expect(r.body.report.general.map((o: any) => o.code)).toContain("art4_alfabetizare");
    const del = await call("DELETE", `/api/self-assessments/${t}/tools/${r.body.report.tools[2].id}`);
    expect(del.body.report.tools).toHaveLength(2);
  });
});

describe("directorul cabinetelor", () => {
  it("doar cabinetele care au ales să apară, active; filtru pe județ și căutare după nume", async () => {
    const A = await seedCabinet("Avocatura Someș");      // listat în Cluj (seed)
    const B = await seedCabinet("Lex Banat");
    await call("PUT", "/api/organization/directory", { token: B.token, body: { listed: true, county: "Timiș", city: "Timișoara", description: "Protecția datelor și AI", website: "https://lexbanat.ro" } });
    const H = await seedCabinet("Ascuns Partners");
    await call("PUT", "/api/organization/directory", { token: H.token, body: { listed: false } });
    expect((await call("PUT", "/api/organization/directory", { token: H.token, body: { listed: true } })).status).toBe(400); // fără județ

    const all = await call("GET", "/api/directory?limit=100");
    check(C.directoryPage, all.body);
    const ids = all.body.data.map((o: any) => o.id);
    expect(ids).toEqual(expect.arrayContaining([A.organizationId, B.organizationId]));
    expect(ids).not.toContain(H.organizationId);

    const tm = await call("GET", "/api/directory?county=Timi%C8%99&limit=100");
    expect(tm.body.data.map((o: any) => o.id)).toContain(B.organizationId);
    expect(tm.body.data.every((o: any) => o.county === "Timiș")).toBe(true);
    const byName = await call("GET", `/api/directory?search=${encodeURIComponent("someș")}`);
    expect(byName.body.data.map((o: any) => o.id)).toContain(A.organizationId);
    expect((await call("GET", "/api/directory/counties")).body.data).toEqual(expect.arrayContaining(["Cluj", "Timiș"]));

    // suspendat sau cu proba expirată → nu mai apare
    await rootDb.update(organizations).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(organizations.id, B.organizationId));
    expect((await call("GET", "/api/directory?county=Timi%C8%99&limit=100")).body.data.map((o: any) => o.id)).not.toContain(B.organizationId);
  });
});

describe("solicitarea către cabinet", () => {
  it("consimțământ explicit, cel puțin un instrument, fără duplicate; cabinetul e anunțat", async () => {
    const A = await seedCabinet("Cabinet Solicitări");
    const { body, email } = await newAssessment();
    const t = body.token;
    expect((await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: A.organizationId, consent: true } })).status).toBe(400); // fără instrumente
    await call("POST", `/api/self-assessments/${t}/tools`, { body: { name: "Selecție CV", answers: { recruitment: true } } });
    expect((await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: A.organizationId } })).status).toBe(400); // fără consimțământ
    const H = await seedCabinet("Nelistat");
    await call("PUT", "/api/organization/directory", { token: H.token, body: { listed: false } });
    expect((await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: H.organizationId, consent: true } })).status).toBe(404);

    const ok = await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: A.organizationId, consent: true, message: "Avem nevoie de ajutor până în martie." } });
    expect(ok.status).toBe(201);
    expect(ok.body.requests[0]).toMatchObject({ cabinetName: "Cabinet Solicitări", status: "nou", cabinetEmail: null });
    expect((await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: A.organizationId, consent: true } })).status).toBe(409);
    await runJobs();
    expect(sentEmails().some((m) => m.to === A.email && m.subject.includes("Transport Rapid SRL"))).toBe(true);

    // la cabinet
    const list = await call("GET", "/api/referrals?status=nou", { token: A.token });
    const ref = list.body.data.find((r: any) => r.contact.email === email);
    check(C.referral, ref);
    expect(ref.needsLawyer).toBe(true);
    expect(ref.message).toContain("martie");
    expect(list.body.pending).toBeGreaterThanOrEqual(1);
  });

  it("acceptarea creează clientul și instrumentele (sursa autoevaluare), firma e anunțată și vede contactul", async () => {
    const A = await seedCabinet("Cabinet Accept");
    const { body, email } = await newAssessment({ cui: "RO 14399840" });
    const t = body.token;
    await call("POST", `/api/self-assessments/${t}/tools`, { body: { name: "Selecție CV", answers: { recruitment: true } } });
    await call("POST", `/api/self-assessments/${t}/tools`, { body: { name: "Chatbot", answers: { talksToPeople: true } } });
    await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: A.organizationId, consent: true } });
    const ref = (await call("GET", "/api/referrals", { token: A.token })).body.data.find((r: any) => r.contact.email === email);
    _clearOutbox();
    const acc = await call("POST", `/api/referrals/${ref.id}/accept`, { token: A.token, body: { message: "Vă sunăm mâine." } });
    expect(acc.status).toBe(200);
    expect((await call("POST", `/api/referrals/${ref.id}/accept`, { token: A.token, body: {} })).status).toBe(409);

    const client = await call("GET", `/api/clients/${acc.body.clientId}`, { token: A.token });
    check(C.clientDetail, client.body);
    expect(client.body).toMatchObject({ name: "Transport Rapid SRL", cui: "14399840", contactEmail: email });
    expect(client.body.aiSystems.map((s: any) => [s.name, s.source, s.riskLevel]).sort()).toEqual([["Chatbot", "autoevaluare", "transparenta"], ["Selecție CV", "autoevaluare", "risc_ridicat"]]);
    expect(client.body.aiSystems.every((s: any) => s.reviewStatus === "propus")).toBe(true);
    expect(client.body.clientObligations.length).toBeGreaterThan(0);

    await runJobs();
    expect(sentEmails().find((m) => m.to === email && m.subject.includes("a acceptat"))!.text).toContain("Vă sunăm mâine.");
    const firm = await call("GET", `/api/self-assessments/${t}`);
    expect(firm.body.requests[0]).toMatchObject({ status: "acceptat", responseMessage: "Vă sunăm mâine.", cabinetEmail: A.email });
  });

  it("refuzul: firma e anunțată și poate alege alt cabinet; maximum 3 cabinete", async () => {
    const cabs = await Promise.all(["Unu", "Doi", "Trei", "Patru"].map((n) => seedCabinet(`Cabinet ${n}`)));
    const { body, email } = await newAssessment();
    const t = body.token;
    await call("POST", `/api/self-assessments/${t}/tools`, { body: { name: "Chatbot", answers: { talksToPeople: true } } });
    await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: cabs[0].organizationId, consent: true } });
    const ref = (await call("GET", "/api/referrals", { token: cabs[0].token })).body.data.find((r: any) => r.contact.email === email);
    _clearOutbox();
    expect((await call("POST", `/api/referrals/${ref.id}/decline`, { token: cabs[0].token, body: { message: "Nu avem capacitate luna aceasta." } })).body.status).toBe("respins");
    await runJobs();
    expect(sentEmails().find((m) => m.to === email && m.subject.startsWith("Răspuns de la"))!.text).toContain("alt cabinet");
    await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: cabs[1].organizationId, consent: true } });
    await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: cabs[2].organizationId, consent: true } });
    expect((await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: cabs[3].organizationId, consent: true } })).status).toBe(400);
  });

  it("acceptarea respectă limita planului; ștergerea autoevaluării lasă solicitarea la cabinet", async () => {
    const A = await seedCabinet("Cabinet Plin");
    for (let i = 0; i < 9; i++) await call("POST", "/api/clients", { token: A.token, body: { name: `Plin ${i} SRL` } });
    const { body, email } = await newAssessment();
    await call("POST", `/api/self-assessments/${body.token}/tools`, { body: { name: "Chatbot", answers: { talksToPeople: true } } });
    await call("POST", `/api/self-assessments/${body.token}/requests`, { body: { organizationId: A.organizationId, consent: true } });
    const ref = (await call("GET", "/api/referrals", { token: A.token })).body.data.find((r: any) => r.contact.email === email);
    const r = await call("POST", `/api/referrals/${ref.id}/accept`, { token: A.token, body: {} });
    expect(r.status).toBe(402);
    expect((await rootDb.select().from(aiSystems).where(eq(aiSystems.source, "autoevaluare"))).every((s) => s.organizationId !== A.organizationId)).toBe(true);

    expect((await call("DELETE", `/api/self-assessments/${body.token}`)).status).toBe(204);
    expect((await call("GET", `/api/self-assessments/${body.token}`)).status).toBe(404);
    expect((await call("GET", `/api/referrals/${ref.id}`, { token: A.token })).status).toBe(200);
  });
});

describe("confirmarea emailului și recuperarea linkurilor", () => {
  it("fără confirmare nu se poate trimite la un cabinet; linkul din email confirmă adresa", async () => {
    const A = await seedCabinet("Cabinet Confirmare");
    const { body, email } = await newAssessment({}, { verify: false });
    const t = body.token;
    await call("POST", `/api/self-assessments/${t}/tools`, { body: { name: "Chatbot", answers: { talksToPeople: true } } });
    const blocked = await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: A.organizationId, consent: true } });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("email_unverified");
    expect((await call("GET", `/api/self-assessments/${t}`)).body.emailVerified).toBe(false);

    await runJobs();
    const [, linkToken, code] = linkIn(sentEmails().find((m) => m.to === email)!.text);
    expect(linkToken).toBe(t);
    expect((await call("POST", `/api/self-assessments/${t}/verify`, { body: { code: "x".repeat(43) } })).status).toBe(400);
    const ok = await call("POST", `/api/self-assessments/${t}/verify`, { body: { code } });
    expect(ok.body.emailVerified).toBe(true);
    expect((await call("POST", `/api/self-assessments/${t}/requests`, { body: { organizationId: A.organizationId, consent: true } })).status).toBe(201);
  });

  it("retrimiterea confirmării invalidează linkul vechi; schimbarea emailului cere o nouă confirmare", async () => {
    const { body, email } = await newAssessment({}, { verify: false });
    const t = body.token;
    await runJobs();
    const [, , oldCode] = linkIn(sentEmails().find((m) => m.to === email)!.text);
    _clearOutbox();
    await call("POST", `/api/self-assessments/${t}/resend-confirmation`);
    await runJobs();
    const [, , newCode] = linkIn(sentEmails().find((m) => m.to === email)!.text);
    expect(newCode).not.toBe(oldCode);
    expect((await call("POST", `/api/self-assessments/${t}/verify`, { body: { code: oldCode } })).status).toBe(400);
    expect((await call("POST", `/api/self-assessments/${t}/verify`, { body: { code: newCode } })).body.emailVerified).toBe(true);

    const other = `${unique("nou")}@firma.ro`;
    _clearOutbox();
    const upd = await call("PUT", `/api/self-assessments/${t}`, { body: { companyName: "Transport Rapid SRL", contactName: "Maria Ionescu", contactEmail: other } });
    expect(upd.body.emailVerified).toBe(false);
    await runJobs();
    expect(sentEmails().some((m) => m.to === other && m.subject.startsWith("Confirmați adresa"))).toBe(true);
  });

  it("recuperarea: linkuri noi pentru toate autoevaluările adresei; cele vechi nu mai merg; răspuns identic", async () => {
    const email = `${unique("rec")}@firma.ro`;
    const a1 = await call("POST", "/api/self-assessments", { body: { companyName: "Alfa SRL", contactName: "Ion", contactEmail: email, terms: true } });
    const a2 = await call("POST", "/api/self-assessments", { body: { companyName: "Beta SRL", contactName: "Ion", contactEmail: email, terms: true } });
    await verifySelfAssessment(a2.body.token);
    const unknown = await call("POST", "/api/self-assessment-recovery", { body: { email: "nimeni@nicaieri.ro" } });
    await runJobs();
    _clearOutbox();
    const known = await call("POST", "/api/self-assessment-recovery", { body: { email: email.toUpperCase() } });
    expect(known.body).toEqual(unknown.body);
    await runJobs();
    const mail = sentEmails().find((m) => m.to === email && m.subject.includes("Linkurile"))!;
    expect(mail.text).toContain("Alfa SRL");
    expect(mail.text).toContain("Beta SRL");
    expect((await call("GET", `/api/self-assessments/${a1.body.token}`)).status).toBe(404);
    const links = [...mail.html.matchAll(/\/autoevaluare\/([A-Za-z0-9_-]+)(?:\?confirmare=([A-Za-z0-9_-]+))?/g)];
    expect(links).toHaveLength(2);
    for (const [, tok, code] of links) {
      const r = await call("GET", `/api/self-assessments/${tok}`);
      expect(r.status).toBe(200);
      if (code) expect((await call("POST", `/api/self-assessments/${tok}/verify`, { body: { code } })).body.emailVerified).toBe(true);
    }
  });
});
