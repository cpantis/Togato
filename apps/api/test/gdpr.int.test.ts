/** GDPR: registrul prelucrărilor, cererile persoanelor vizate, incidentele de securitate. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { ZodTypeAny } from "zod";
import { unzipSync, strFromU8 } from "fflate";
import { rootDb } from "../src/db";
import { dsarRequests, jobs } from "../src/db/schema";
import { app } from "../src/app";
import { drain } from "../src/jobs/queue";
import { handlers } from "../src/jobs/handlers";
import { _clearOutbox, sentEmails } from "../src/services/email";
import * as C from "./contracts";
import { call, seedCabinet } from "./helpers";

function check(schema: ZodTypeAny, body: unknown) {
  const r = schema.safeParse(body);
  if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
}
async function runJobs() {
  await rootDb.execute(sql`update jobs set run_at = now() where status = 'pending'`);
  await drain(handlers);
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

beforeEach(async () => { await runJobs(); _clearOutbox(); });

describe("registrul prelucrărilor", () => {
  it("creare cu verificări; DPIA probabilă; sisteme AI doar ale clientului; Word", async () => {
    const A = await seedCabinet("Registru");
    const B = await seedCabinet("Registru Străin");
    const incomplete = await call("POST", `/api/clients/${A.clientId}/processing`, { token: A.token, body: { name: "Medicina muncii", purpose: "Fișe de aptitudine", dataCategories: ["sanatate"], subjectCategories: ["angajati"] } });
    expect(incomplete.status).toBe(201);
    check(C.processingActivity, incomplete.body);
    expect(incomplete.body.check.issues.join(" ")).toMatch(/temeiul legal.*|Art\. 9\(2\)/);
    expect(incomplete.body.check.dpiaLikely).toBe(true);

    expect((await call("POST", `/api/clients/${A.clientId}/processing`, { token: A.token, body: { name: "Recrutare", purpose: "Selecție", aiSystemIds: [B.systemId] } })).status).toBe(400);
    const withAi = await call("POST", `/api/clients/${A.clientId}/processing`, { token: A.token, body: { name: "Recrutare", purpose: "Selecția candidaților", aiSystemIds: [A.systemId], subjectCategories: ["candidati"], dataCategories: ["identificare"] } });
    expect(withAi.body.check.dpiaReasons).toContain("utilizare inovatoare a tehnologiei (sistem AI)");
    expect((await call("POST", `/api/clients/${A.clientId}/processing`, { token: A.token, body: { name: "X", purpose: "Y", legalBases: ["6_1_z"] } })).status).toBe(400);

    const upd = await call("PUT", `/api/processing/${incomplete.body.id}`, { token: A.token, body: { ...incomplete.body, legalBases: ["6_1_c"], specialConditions: ["9_2_h"], retention: "Pe durata contractului + 5 ani", securityMeasures: ["acces", "criptare"] } });
    expect(upd.body.check.issues).toEqual([]);

    const all = await call("GET", `/api/clients/${A.clientId}/gdpr`, { token: A.token });
    check(C.clientGdpr, all.body);
    expect(all.body.processing.map((a: any) => a.name)).toEqual(["Medicina muncii", "Recrutare", "Salarizare"]);

    const doc = await app.request(`/api/clients/${A.clientId}/gdpr/ropa`, { headers: { authorization: `Bearer ${A.token}` } });
    expect(doc.status).toBe(200);
    const docx = unzipSync(new Uint8Array(await doc.arrayBuffer()));
    const xml = strFromU8(docx["word/document.xml"]);
    expect(xml).toContain("Registrul activităților de prelucrare");
    expect(xml).toContain("Medicina muncii");
    expect(xml).toContain("Art. 9(2)(h)");
  });
});

describe("cererile persoanelor vizate", () => {
  it("termen de o lună; prelungire motivată în termen; închidere cu răspuns", async () => {
    const A = await seedCabinet("Cereri");
    const r = await call("POST", `/api/clients/${A.clientId}/dsar`, { token: A.token, body: { type: "stergere", requesterName: "Ion Ionescu", requesterContact: "ion@example.ro", receivedOn: "2026-01-31" } });
    check(C.dsarRequest, r.body);
    expect(r.body.dueOn).toBe("2026-02-28");
    expect(r.body.overdue).toBe(true);
    expect((await call("POST", `/api/clients/${A.clientId}/dsar`, { token: A.token, body: { type: "acces", requesterName: "X Y", receivedOn: "2999-01-01" } })).status).toBe(400);

    // prelungirea doar în termenul inițial
    expect((await call("PATCH", `/api/dsar/${r.body.id}`, { token: A.token, body: { extend: { reason: "Volum mare de date de identificat în arhive." } } })).status).toBe(400);
    const fresh = await call("POST", `/api/clients/${A.clientId}/dsar`, { token: A.token, body: { type: "acces", requesterName: "Maria Pop", receivedOn: daysAgo(3) } });
    expect((await call("PATCH", `/api/dsar/${fresh.body.id}`, { token: A.token, body: { extend: { reason: "scurt" } } })).status).toBe(400);
    const ext = await call("PATCH", `/api/dsar/${fresh.body.id}`, { token: A.token, body: { extend: { reason: "Cererea vizează date din mai multe sisteme." } } });
    expect(ext.body.extended).toBe(true);
    expect(ext.body.dueOn > fresh.body.dueOn).toBe(true);
    expect((await call("PATCH", `/api/dsar/${fresh.body.id}`, { token: A.token, body: { extend: { reason: "Încă o prelungire, nepermisă." } } })).status).toBe(400);

    expect((await call("PATCH", `/api/dsar/${fresh.body.id}`, { token: A.token, body: { status: "finalizata" } })).status).toBe(400);
    const done = await call("PATCH", `/api/dsar/${fresh.body.id}`, { token: A.token, body: { status: "finalizata", identityVerified: true, outcome: "Copia datelor trimisă pe email." } });
    expect(done.body).toMatchObject({ status: "finalizata", overdue: false, identityVerified: true });
    expect(done.body.closedOn).toBeTruthy();
  });
});

describe("incidentele de securitate", () => {
  it("72 de ore; alertă imediată și reamintire; notificare întârziată cere motivare; închidere condiționată", async () => {
    const A = await seedCabinet("Incidente");
    _clearOutbox();
    const discovered = new Date(Date.now() - 10 * 3600_000).toISOString();
    const r = await call("POST", `/api/clients/${A.clientId}/breaches`, { token: A.token, body: { title: "Ransomware pe serverul de fișiere", discoveredAt: discovered, breachTypes: ["disponibilitate", "confidentialitate"], dataCategories: ["identificare", "financiare"], subjectsAffected: 1200, risk: "risc_ridicat" } });
    expect(r.status).toBe(201);
    check(C.breach, r.body);
    expect(new Date(r.body.deadline).getTime() - new Date(discovered).getTime()).toBe(72 * 3600_000);
    expect(r.body.duties).toMatchObject({ notifyAuthority: true, notifySubjects: true });
    const queued = await rootDb.select().from(jobs).where(sql`type = 'breach.alert' and payload->>'breachId' = ${r.body.id}`);
    expect(queued.map((j) => (j.payload as any).kind).sort()).toEqual(["nou", "reamintire"]);
    await runJobs();
    expect(sentEmails().some((m) => m.to === A.email && m.subject.includes("Incident de securitate"))).toBe(true);
    expect(sentEmails().some((m) => m.to === A.email && m.subject.includes("Mai sunt 24 de ore"))).toBe(true);

    const base = { title: r.body.title, discoveredAt: discovered, risk: "risc_ridicat" };
    expect((await call("PUT", `/api/breaches/${r.body.id}`, { token: A.token, body: { ...base, closed: true } })).status).toBe(400); // nenotificat
    expect((await call("PUT", `/api/breaches/${r.body.id}`, { token: A.token, body: { ...base, discoveredAt: new Date(Date.now() + 86400_000).toISOString() } })).status).toBe(400);
    const late = new Date(Date.now()).toISOString();
    const old = await call("POST", `/api/clients/${A.clientId}/breaches`, { token: A.token, body: { title: "Email trimis greșit", discoveredAt: new Date(Date.now() - 100 * 3600_000).toISOString(), risk: "risc" } });
    expect(old.body.authorityOverdue).toBe(true);
    expect((await call("PUT", `/api/breaches/${old.body.id}`, { token: A.token, body: { title: "Email trimis greșit", discoveredAt: old.body.discoveredAt, risk: "risc", authorityNotifiedAt: late } })).status).toBe(400);
    const ok = await call("PUT", `/api/breaches/${old.body.id}`, { token: A.token, body: { title: "Email trimis greșit", discoveredAt: old.body.discoveredAt, risk: "risc", authorityNotifiedAt: late, authorityReference: "ANSPDCP 1234/2026", delayReason: "Incidentul a fost semnalat în weekend; analiza a durat.", closed: true } });
    expect(ok.status).toBe(200);
    expect(ok.body.closedAt).toBeTruthy();
    expect(ok.body.authorityOverdue).toBe(false);

    // fără risc: se închide doar cu motivare, fără notificare
    const minor = await call("POST", `/api/clients/${A.clientId}/breaches`, { token: A.token, body: { title: "Document criptat pierdut", discoveredAt: new Date(Date.now() - 3600_000).toISOString(), risk: "fara_risc" } });
    expect((await call("PUT", `/api/breaches/${minor.body.id}`, { token: A.token, body: { title: "Document criptat pierdut", discoveredAt: minor.body.discoveredAt, risk: "fara_risc", closed: true } })).status).toBe(400);
    expect((await call("PUT", `/api/breaches/${minor.body.id}`, { token: A.token, body: { title: "Document criptat pierdut", discoveredAt: minor.body.discoveredAt, risk: "fara_risc", riskReasoning: "Fișierul era criptat AES-256; cheia nu a fost compromisă.", closed: true } })).status).toBe(200);

    const doc = await app.request(`/api/breaches/${r.body.id}/notification`, { headers: { authorization: `Bearer ${A.token}` } });
    const xml = strFromU8(unzipSync(new Uint8Array(await doc.arrayBuffer()))["word/document.xml"]);
    expect(xml).toContain("Ransomware pe serverul de fișiere");
    expect(xml).toContain("1200");
  });

  it("panoul GDPR și rezumatul zilnic includ cererile scadente și incidentele nenotificate", async () => {
    const A = await seedCabinet("Panou GDPR");
    await rootDb.update(dsarRequests).set({ dueOn: daysAgo(1) }).where(eq(dsarRequests.id, A.dsarId));
    const ov = await call("GET", "/api/gdpr/overview", { token: A.token });
    expect(ov.body.dsars.find((d: any) => d.id === A.dsarId)).toMatchObject({ overdue: true, clientName: expect.any(String) });
    expect(ov.body.breaches.map((b: any) => b.id)).toContain(A.breachId);
    _clearOutbox();
    await handlers["reminders.daily"]({ date: new Date().toISOString().slice(0, 10) }, { id: "x", attempts: 1, type: "reminders.daily" });
    await runJobs();
    const digest = sentEmails().find((m) => m.to === A.email && /termene/.test(m.subject))!;
    expect(digest.text).toContain("Cerere GDPR (Acces la date)");
    expect(digest.text).toContain("Incident de securitate — notificare ANSPDCP: Laptop pierdut");
  });

  it("exportul dosarului conține registrul și CSV-urile GDPR", async () => {
    const A = await seedCabinet("Export GDPR");
    const res = await app.request(`/api/clients/${A.clientId}/export`, { headers: { authorization: `Bearer ${A.token}` } });
    const names = Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer())));
    expect(names).toEqual(expect.arrayContaining(["gdpr/registru_prelucrari.csv", "gdpr/cereri_persoane_vizate.csv", "gdpr/incidente_securitate.csv"]));
    expect(names.some((n) => n.startsWith("gdpr/") && n.endsWith(".docx"))).toBe(true);
  });
});

describe("evaluarea de impact și scrisorile", () => {
  it("lista ANSPDCP face evaluarea obligatorie; proiect precompletat; finalizare doar completă; Word", async () => {
    const A = await seedCabinet("DPIA");
    const act = await call("POST", `/api/clients/${A.clientId}/processing`, { token: A.token, body: { name: "Monitorizarea flotei", purpose: "Localizarea vehiculelor de serviciu", legalBases: ["6_1_f"], dataCategories: ["localizare"], subjectCategories: ["angajati"], dpiaListItems: ["iot"], retention: "6 luni", securityMeasures: ["acces"], systematicMonitoring: true } });
    expect(act.body.check.dpiaMandatory).toBe(true);
    expect(act.body.dpia).toBeNull();

    const draft = await call("GET", `/api/processing/${act.body.id}/dpia`, { token: A.token });
    check(C.dpiaResponse, draft.body);
    expect(draft.body.saved).toBe(false);
    expect(draft.body.dpia.description).toContain("Localizarea vehiculelor");
    expect(draft.body.dpia.risks.map((r: any) => r.title)).toContain("Intruziune în viața privată");

    const risks = draft.body.dpia.risks;
    const notReady = await call("PUT", `/api/processing/${act.body.id}/dpia`, { token: A.token, body: { ...draft.body.dpia, finalize: true } });
    expect(notReady.status).toBe(400);
    expect(notReady.body.missing.length).toBeGreaterThan(0);

    const saved = await call("PUT", `/api/processing/${act.body.id}/dpia`, { token: A.token, body: { ...draft.body.dpia, necessity: "Localizarea e necesară pentru siguranța șoferilor; doar în timpul programului.", risks: risks.map((r: any) => ({ ...r, measures: "Acces restricționat, informarea angajaților, dezactivare în afara programului." })), reviewOn: "2027-11-01" } });
    expect(saved.body.saved).toBe(true);
    expect(saved.body.dpia.finalizedAt).toBeNull();
    const fin = await call("PUT", `/api/processing/${act.body.id}/dpia`, { token: A.token, body: { ...saved.body.dpia, finalize: true } });
    expect(fin.status).toBe(200);
    expect(fin.body.dpia.finalizedAt).toBeTruthy();
    expect(fin.body.activity.dpia).toMatchObject({ outcome: "acceptabil_cu_masuri" });

    // risc rezidual ridicat → consultare prealabilă
    const high = await call("PUT", `/api/processing/${act.body.id}/dpia`, { token: A.token, body: { ...fin.body.dpia, risks: [{ ...fin.body.dpia.risks[0], likelihood: 3, severity: 3, residualLikelihood: 2, residualSeverity: 3 }] } });
    expect(high.body.dpia.assessment.outcome).toBe("consultare_prealabila");
    expect(high.body.dpia.finalizedAt).toBeNull(); // modificarea readuce la proiect

    const gd = await call("GET", `/api/clients/${A.clientId}/gdpr`, { token: A.token });
    check(C.clientGdpr, gd.body);
    expect(gd.body.processing.find((p: any) => p.id === act.body.id).dpia.outcome).toBe("consultare_prealabila");

    const doc = await app.request(`/api/processing/${act.body.id}/dpia/docx`, { headers: { authorization: `Bearer ${A.token}` } });
    const xml = strFromU8(unzipSync(new Uint8Array(await doc.arrayBuffer()))["word/document.xml"]);
    expect(xml).toContain("Evaluarea impactului asupra protecției datelor");
    expect(xml).toContain("Art. 36");
    expect(xml).toContain("Lista ANSPDCP");
  });

  it("scrisorile pentru cereri: toate tipurile; notificarea prelungirii doar după prelungire", async () => {
    const A = await seedCabinet("Scrisori");
    const letter = (id: string, kind: string) => app.request(`/api/dsar/${id}/letter?kind=${kind}`, { headers: { authorization: `Bearer ${A.token}` } });
    const xmlOf = async (r: Response) => strFromU8(unzipSync(new Uint8Array(await r.arrayBuffer()))["word/document.xml"]);
    expect((await letter(A.dsarId, "prelungire")).status).toBe(400);
    expect((await letter(A.dsarId, "necunoscut")).status).toBe(400);
    const access = await xmlOf(await letter(A.dsarId, "raspuns"));
    expect(access).toContain("Salarizare"); // activitățile din registru
    expect(access).toContain("dataprotection.ro");
    expect(await xmlOf(await letter(A.dsarId, "confirmare"))).toContain("Vă confirmăm primirea");
    expect(await xmlOf(await letter(A.dsarId, "identitate"))).toContain("art. 12 alin. (6)");
    await call("PATCH", `/api/dsar/${A.dsarId}`, { token: A.token, body: { extend: { reason: "Datele sunt în mai multe sisteme de arhivă." } } });
    expect(await xmlOf(await letter(A.dsarId, "prelungire"))).toContain("Datele sunt în mai multe sisteme de arhivă.");
    for (const type of ["stergere", "rectificare", "restrictionare", "portabilitate", "opozitie", "decizii_automate"]) {
      const d = await call("POST", `/api/clients/${A.clientId}/dsar`, { token: A.token, body: { type, requesterName: "Test Persoană", receivedOn: new Date().toISOString().slice(0, 10) } });
      expect((await letter(d.body.id, "raspuns")).status).toBe(200);
      expect((await letter(d.body.id, "refuz")).status).toBe(200);
    }
  });
});
