/** Coada de joburi, emailurile și memoriul asincron, pe baza de date reală. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { aiSystems, jobs, obligations, organizations } from "../src/db/schema";
import { PermanentJobError, drain, enqueue, releaseStale, runOnce } from "../src/jobs/queue";
import { handlers, scheduleRecurring } from "../src/jobs/handlers";
import { _clearOutbox, sentEmails } from "../src/services/email";
import { call, seedCabinet, unique } from "./helpers";

vi.mock("../src/services/memo", async (orig) => ({
  ...(await orig<typeof import("../src/services/memo")>()),
  memoAvailable: () => true,
  generateMemo: vi.fn(async () => ({ text: "## Concluzie\nRisc ridicat [1].", citations: [{ n: 1, ref: "Art. 26(1)", quote: "..." }] })),
}));

/** rulează tot ce e scadent, inclusiv joburile programate în viitor (le aduce în prezent) */
async function runAll() {
  await db.execute(sql`update jobs set run_at = now() where status = 'pending'`);
  return drain(handlers);
}

beforeEach(async () => {
  await runAll(); // nimic rămas de la alte teste
  _clearOutbox();
});

describe("coada de joburi", () => {
  it("dedupeKey împiedică dublarea; un job e preluat o singură dată", async () => {
    const key = unique("k");
    const a = await enqueue("test.noop", {}, { dedupeKey: key });
    const b = await enqueue("test.noop", {}, { dedupeKey: key });
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    let runs = 0;
    const h = { "test.noop": async () => { runs++; await new Promise((r) => setTimeout(r, 50)); } };
    await Promise.all([runOnce(h), runOnce(h), runOnce(h)]);
    expect(runs).toBe(1);
  });

  it("reia joburile eșuate cu întârziere și le marchează eșuate după maxAttempts", async () => {
    const id = (await enqueue("test.flaky", {}, { maxAttempts: 2 }))!;
    const h = { "test.flaky": async () => { throw new Error("temporar"); } };
    await runOnce(h);
    let row = (await db.select().from(jobs).where(eq(jobs.id, id)))[0];
    expect(row.status).toBe("pending");
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    await db.update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, id));
    await runOnce(h);
    row = (await db.select().from(jobs).where(eq(jobs.id, id)))[0];
    expect(row.status).toBe("failed");
    expect(row.lastError).toBe("temporar");
  });

  it("o eroare permanentă nu se reia", async () => {
    const id = (await enqueue("test.perm", {}, { maxAttempts: 5 }))!;
    await runOnce({ "test.perm": async () => { throw new PermanentJobError("date invalide"); } });
    const row = (await db.select().from(jobs).where(eq(jobs.id, id)))[0];
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(1);
  });

  it("joburile rămase blocate de un worker căzut sunt eliberate", async () => {
    const id = (await enqueue("test.stale", {}))!;
    await db.update(jobs).set({ status: "running", lockedAt: new Date(Date.now() - 3600_000) }).where(eq(jobs.id, id));
    expect(await releaseStale()).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(jobs).where(eq(jobs.id, id)))[0].status).toBe("pending");
    await db.delete(jobs).where(eq(jobs.id, id));
  });

  it("programările zilnice sunt idempotente", async () => {
    const now = new Date("2031-01-15T10:00:00Z");
    await scheduleRecurring(now);
    await scheduleRecurring(now);
    const rows = await db.select().from(jobs).where(eq(jobs.dedupeKey, "reminders:2031-01-15"));
    expect(rows).toHaveLength(1);
    await db.delete(jobs).where(sql`dedupe_key like '%2031-01-15'`);
  });
});

describe("emailuri", () => {
  it("invitația pleacă pe email doar după ce tranzacția reușește", async () => {
    const A = await seedCabinet("Mail");
    await runAll();
    _clearOutbox();
    const to = `${unique("nou")}@x.ro`;
    const r = await call("POST", "/api/team/invitations", { token: A.token, body: { email: to } });
    expect(r.status).toBe(201);
    expect(sentEmails()).toHaveLength(0); // încă în coadă
    await runAll();
    const mail = sentEmails().find((m) => m.to === to)!;
    expect(mail.subject).toContain("Invitație");
    expect(mail.text).toContain(r.body.url);
    // fără email, la cerere
    const to2 = `${unique("nou")}@x.ro`;
    await call("POST", "/api/team/invitations", { token: A.token, body: { email: to2, sendEmail: false } });
    await runAll();
    expect(sentEmails().some((m) => m.to === to2)).toBe(false);
  });

  it("linkul de portal se trimite clientului, cu răspuns către avocat; trimiterea din portal anunță cabinetul", async () => {
    const A = await seedCabinet("Portal Mail");
    await runAll();
    _clearOutbox();
    const r = await call("POST", `/api/clients/${A.clientId}/portal`, { token: A.token, body: { sendTo: "Contact@Client.ro", message: "Vă rog <b>azi</b>" } });
    expect(r.status).toBe(201);
    await runAll();
    const mail = sentEmails().find((m) => m.to === "contact@client.ro")!;
    expect(mail.replyTo).toBe(A.email);
    expect(mail.html).toContain("&lt;b&gt;azi&lt;/b&gt;"); // mesajul avocatului e escapat
    expect(mail.text).toContain(r.body.url);

    const token = r.body.url.split("/portal/")[1];
    const sub = await call("POST", `/api/portal/${token}/systems`, { body: { name: "Chatbot", contactName: "Ion Pop", answers: { biometrics: true } } });
    expect(sub.status).toBe(201);
    _clearOutbox();
    await runAll(); // notificarea are 2 minute întârziere; runAll o aduce în prezent
    await runAll(); // jobul de notificare pune emailul în coadă
    const notice = sentEmails().find((m) => m.to === A.email && m.subject.includes("Chatbot"))!;
    expect(notice).toBeTruthy();
    expect(notice.text).toContain("biometrice");
  });

  it("rezumatul zilnic grupează termenele per responsabil și respectă preferința", async () => {
    const A = await seedCabinet("Termene");
    await runAll();
    _clearOutbox();
    await db.update(obligations).set({ dueDate: "2031-03-03" }).where(eq(obligations.id, A.obligationId));
    await handlers["reminders.daily"]({ date: "2031-03-01" }, { id: "x", attempts: 1, type: "reminders.daily" });
    await runAll();
    const digest = sentEmails().find((m) => m.to === A.email)!;
    expect(digest.subject).toMatch(/termene/);
    expect(digest.text).toContain("2031-03-03");

    _clearOutbox();
    await call("PUT", "/api/account/notifications", { token: A.token, body: { notifyDeadlines: false } });
    await handlers["reminders.daily"]({ date: "2031-03-02" }, { id: "x", attempts: 1, type: "reminders.daily" });
    await runAll();
    expect(sentEmails().some((m) => m.to === A.email)).toBe(false);
  });
});

describe("memoriul AI asincron", () => {
  it("cererea întoarce imediat „in_lucru”; workerul salvează memoriul", async () => {
    const A = await seedCabinet("Memo");
    const [org] = await db.select({ id: aiSystems.organizationId }).from(aiSystems).where(eq(aiSystems.id, A.systemId));
    await db.update(organizations).set({ aiEnabled: true }).where(eq(organizations.id, org.id));
    const r = await call("POST", `/api/ai-systems/${A.systemId}/memo`, { token: A.token });
    expect(r.status).toBe(202);
    expect(r.body.aiMemoStatus).toBe("in_lucru");
    // a doua cerere cât prima e în lucru nu dublează jobul
    await call("POST", `/api/ai-systems/${A.systemId}/memo`, { token: A.token });
    const queued = await db.select().from(jobs).where(sql`type = 'memo.generate' and payload->>'aiSystemId' = ${A.systemId}`);
    expect(queued).toHaveLength(1);
    await runAll();
    const done = await call("GET", `/api/ai-systems/${A.systemId}`, { token: A.token });
    expect(done.body.aiMemoStatus).toBe("gata");
    expect(done.body.aiMemo).toContain("Concluzie");
    expect(done.body.aiMemoCitations).toHaveLength(1);
  });

  it("un eșec definitiv e afișat utilizatorului", async () => {
    const { generateMemo } = await import("../src/services/memo");
    vi.mocked(generateMemo).mockRejectedValueOnce(new Error("Analiza AI nu a putut fi generată pentru acest dosar."));
    const A = await seedCabinet("Memo Fail");
    const [org] = await db.select({ id: aiSystems.organizationId }).from(aiSystems).where(eq(aiSystems.id, A.systemId));
    await db.update(organizations).set({ aiEnabled: true }).where(eq(organizations.id, org.id));
    await call("POST", `/api/ai-systems/${A.systemId}/memo`, { token: A.token });
    await runAll();
    const r = await call("GET", `/api/ai-systems/${A.systemId}`, { token: A.token });
    expect(r.body.aiMemoStatus).toBe("esuat");
    expect(r.body.aiMemoError).toContain("Analiza AI nu a putut");
  });
});
