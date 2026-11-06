/** Monitorizarea: starea cozii și a backup-ului, alertele către administratorii platformei. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { rootDb } from "../src/db";
import { jobs, opsEvents, users } from "../src/db/schema";
import { _resetConfig } from "../src/config";
import { drain } from "../src/jobs/queue";
import { handlers } from "../src/jobs/handlers";
import { findProblems, systemStatus } from "../src/services/monitoring";
import { _clearOutbox, sentEmails } from "../src/services/email";
import { call, seedCabinet } from "./helpers";

let OP: Awaited<ReturnType<typeof seedCabinet>>;
beforeAll(async () => {
  OP = await seedCabinet("Monitorizare Operare");
  await rootDb.update(users).set({ totpEnabled: true }).where(eq(users.id, OP.userId));
  process.env.PLATFORM_ADMIN_EMAILS = OP.email;
  process.env.MONITOR_BACKUPS = "on";
  _resetConfig();
});
afterAll(() => { delete process.env.PLATFORM_ADMIN_EMAILS; delete process.env.MONITOR_BACKUPS; _resetConfig(); });

const base = () => ({
  checkedAt: new Date().toISOString(),
  queue: { pending: 0, running: 0, overdue: 0, oldestOverdueMinutes: null, failedLastHour: 0, failedLast24h: 0, failedByType: {} },
  daily: {}, backup: { lastOkAt: new Date().toISOString(), lastFailedAt: null, ageHours: 1, expected: true }, emailSuppressions: 0,
});

describe("regulile de alertare", () => {
  it("totul în regulă → nicio problemă", () => expect(findProblems(base())).toEqual([]));
  it("coadă întârziată, joburi eșuate, job zilnic oprit, backup vechi sau eșuat", () => {
    const s = base();
    s.queue = { ...s.queue, overdue: 25, oldestOverdueMinutes: 40, failedLastHour: 2, failedByType: { "email.send": 2 } } as typeof s.queue;
    (s.daily as Record<string, string>)["reminders.daily"] = new Date(Date.now() - 30 * 3600_000).toISOString();
    s.backup = { ...s.backup, ageHours: 30, lastFailedAt: new Date().toISOString(), lastOkAt: new Date(Date.now() - 30 * 3600_000).toISOString() };
    const p = findProblems(s);
    expect(p).toHaveLength(5);
    expect(p.join(" ")).toMatch(/email.send: 2/);
  });
  it("backup-ul nu e verificat dacă nu e așteptat", () => {
    expect(findProblems({ ...base(), backup: { lastOkAt: null, lastFailedAt: null, ageHours: null, expected: false } })).toEqual([]);
  });
});

describe("starea sistemului și alerta", () => {
  it("consola platformei vede starea; alerta orară ajunge la administratorii platformei", async () => {
    await rootDb.delete(opsEvents);
    await rootDb.insert(jobs).values({ type: "email.send", status: "failed", finishedAt: new Date(), lastError: "test", payload: {} });
    const s = await systemStatus();
    expect(s.queue.failedLastHour).toBeGreaterThan(0);
    expect(s.problems.some((x) => x.includes("Nu există niciun backup"))).toBe(true);

    const r = await call("GET", "/api/platform/status", { token: OP.token });
    expect(r.status).toBe(200);
    expect(r.body.problems.length).toBeGreaterThan(0);
    const other = await seedCabinet("Monitorizare Cabinet");
    expect((await call("GET", "/api/platform/status", { token: other.token })).status).toBe(404);

    _clearOutbox();
    await handlers["monitoring.check"]({ hour: "test-1" });
    await rootDb.execute(sql`update jobs set run_at = now() where status = 'pending'`);
    await drain(handlers);
    expect(sentEmails().filter((m) => m.to === OP.email && m.subject.startsWith("Togato:"))).toHaveLength(1);

    // un backup reușit înregistrat de serviciul de backup
    await rootDb.insert(opsEvents).values({ kind: "backup", status: "ok", detail: { bytes: 1234 } });
    expect((await systemStatus()).backup.ageHours).toBe(0);
    await rootDb.delete(jobs).where(eq(jobs.lastError, "test"));
  });
});
