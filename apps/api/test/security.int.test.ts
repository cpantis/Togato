/** Sesiuni, CSRF, resetarea parolei, blocarea contului, limitarea cererilor. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { sessions, users } from "../src/db/schema";
import { app } from "../src/app";
import { drain } from "../src/jobs/queue";
import { handlers } from "../src/jobs/handlers";
import { _clearOutbox, sentEmails } from "../src/services/email";
import { hit } from "../src/middleware/rateLimit";
import { MAX_FAILED } from "../src/routes/auth";
import { call, seedCabinet, unique } from "./helpers";

async function runJobs() {
  await db.execute(sql`update jobs set run_at = now() where status = 'pending'`);
  await drain(handlers);
}

/** un „browser”: păstrează cookie-urile între cereri */
function browser() {
  const jar = new Map<string, string>();
  return {
    jar,
    async req(method: string, path: string, opts: { body?: unknown; csrf?: boolean | string } = {}) {
      const headers: Record<string, string> = {};
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      if (opts.body !== undefined) headers["content-type"] = "application/json";
      if (opts.csrf) headers["x-csrf-token"] = typeof opts.csrf === "string" ? opts.csrf : jar.get("togato_csrf") ?? "";
      const res = await app.request(path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(";");
        const [k, v] = pair.split("=");
        if (/Max-Age=0/i.test(c) || v === "") jar.delete(k); else jar.set(k, v);
      }
      const type = res.headers.get("content-type") || "";
      return { status: res.status, body: type.includes("json") ? await res.json() : null, headers: res.headers };
    },
  };
}

beforeEach(async () => { await runJobs(); _clearOutbox(); });

describe("sesiuni în cookie", () => {
  it("cookie httpOnly; CSRF obligatoriu pentru modificări; ieșirea închide sesiunea", async () => {
    const A = await seedCabinet("Cookie");
    const b = browser();
    const login = await b.req("POST", "/api/auth/login", { body: { email: A.email, password: "parola-sigura-1" } });
    expect(login.status).toBe(200);
    const setCookies = login.headers.getSetCookie().join("\n");
    expect(setCookies).toMatch(/togato_session=[^;]+;.*HttpOnly/i);
    expect(setCookies).toMatch(/SameSite=Lax/i);
    expect(b.jar.get("togato_csrf")).toBeTruthy();

    expect((await b.req("GET", "/api/dashboard")).status).toBe(200);
    // modificare fără antet CSRF → respinsă
    const noCsrf = await b.req("POST", "/api/clients", { body: { name: "Fără CSRF SRL" } });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.code).toBe("csrf");
    expect((await b.req("POST", "/api/clients", { body: { name: "Greșit SRL" }, csrf: "x".repeat(32) })).status).toBe(403);
    expect((await b.req("POST", "/api/clients", { body: { name: "Cu CSRF SRL" }, csrf: true })).status).toBe(201);

    expect((await b.req("POST", "/api/auth/logout", { csrf: true })).status).toBe(204);
    expect(b.jar.has("togato_session")).toBe(false);
    // tokenul vechi nu mai funcționează nici ca Bearer
    expect((await call("GET", "/api/dashboard", { token: login.body.token })).status).toBe(401);
  });

  it("sesiunile expirate sunt respinse", async () => {
    const A = await seedCabinet("Expirat");
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, A.userId));
    expect((await call("GET", "/api/dashboard", { token: A.token })).status).toBe(401);
  });

  it("schimbarea parolei închide celelalte sesiuni, nu și pe cea curentă", async () => {
    const A = await seedCabinet("Parola");
    const other = await call("POST", "/api/auth/login", { body: { email: A.email, password: "parola-sigura-1" } });
    const list = await call("GET", "/api/account/sessions", { token: A.token });
    expect(list.body.data.length).toBe(2);
    expect(list.body.data.filter((s: any) => s.current)).toHaveLength(1);
    expect((await call("POST", "/api/account/password", { token: A.token, body: { currentPassword: "gresita", newPassword: "parola-noua-12" } })).status).toBe(400);
    expect((await call("POST", "/api/account/password", { token: A.token, body: { currentPassword: "parola-sigura-1", newPassword: "parola-noua-12" } })).status).toBe(200);
    expect((await call("GET", "/api/dashboard", { token: A.token })).status).toBe(200);
    expect((await call("GET", "/api/dashboard", { token: other.body.token })).status).toBe(401);
    await runJobs();
    expect(sentEmails().some((m) => m.to === A.email && /schimbată/.test(m.subject))).toBe(true);
    expect((await call("POST", "/api/auth/login", { body: { email: A.email, password: "parola-noua-12" } })).status).toBe(200);
  });

  it("dezactivarea unui coleg îl deconectează imediat", async () => {
    const A = await seedCabinet("Dezactivare");
    const invEmail = `${unique("coleg")}@x.ro`;
    const inv = await call("POST", "/api/team/invitations", { token: A.token, body: { email: invEmail, sendEmail: false } });
    const token = inv.body.url.split("/invite/")[1];
    const acc = await call("POST", "/api/auth/accept-invitation", { body: { token, name: "Coleg Nou", password: "parola-coleg-1" } });
    expect((await call("GET", "/api/dashboard", { token: acc.body.token })).status).toBe(200);
    await call("PATCH", `/api/team/members/${acc.body.user.id}`, { token: A.token, body: { status: "dezactivat" } });
    const left = await db.select().from(sessions).where(eq(sessions.userId, acc.body.user.id));
    expect(left).toHaveLength(0);
    expect((await call("GET", "/api/dashboard", { token: acc.body.token })).status).toBe(401);
  });
});

describe("resetarea parolei", () => {
  it("link pe email, o singură folosire, închide toate sesiunile; răspuns identic pentru adrese inexistente", async () => {
    const A = await seedCabinet("Reset");
    const unknown = await call("POST", "/api/auth/password/forgot", { body: { email: "nimeni@nicaieri.ro" } });
    const known = await call("POST", "/api/auth/password/forgot", { body: { email: A.email.toUpperCase() } });
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    await runJobs();
    const mail = sentEmails().find((m) => m.to === A.email)!;
    const token = mail.text.match(/\/reset\/([A-Za-z0-9_-]+)/)![1];

    expect((await call("POST", "/api/auth/password/reset", { body: { token, password: "scurt" } })).status).toBe(400);
    expect((await call("POST", "/api/auth/password/reset", { body: { token, password: "parola-resetata-1" } })).status).toBe(200);
    expect((await call("POST", "/api/auth/password/reset", { body: { token, password: "alta-parola-12" } })).status).toBe(400);
    expect((await call("GET", "/api/dashboard", { token: A.token })).status).toBe(401);
    expect((await call("POST", "/api/auth/login", { body: { email: A.email, password: "parola-sigura-1" } })).status).toBe(401);
    expect((await call("POST", "/api/auth/login", { body: { email: A.email, password: "parola-resetata-1" } })).status).toBe(200);
  });

  it("un link expirat nu funcționează", async () => {
    const A = await seedCabinet("Reset Expirat");
    await call("POST", "/api/auth/password/forgot", { body: { email: A.email } });
    await runJobs();
    const token = sentEmails().find((m) => m.to === A.email)!.text.match(/\/reset\/([A-Za-z0-9_-]+)/)![1];
    await db.execute(sql`update password_resets set expires_at = now() - interval '1 minute'`);
    expect((await call("POST", "/api/auth/password/reset", { body: { token, password: "parola-resetata-1" } })).status).toBe(400);
  });
});

describe("blocarea contului", () => {
  it(`după ${MAX_FAILED} încercări greșite contul se blochează, chiar și pentru parola corectă`, async () => {
    const A = await seedCabinet("Blocare");
    for (let i = 0; i < MAX_FAILED - 1; i++) {
      expect((await call("POST", "/api/auth/login", { body: { email: A.email, password: "gresit" } })).status).toBe(401);
    }
    expect((await call("POST", "/api/auth/login", { body: { email: A.email, password: "gresit" } })).status).toBe(429);
    const locked = await call("POST", "/api/auth/login", { body: { email: A.email, password: "parola-sigura-1" } });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("locked");
    // după expirarea blocării, parola corectă merge și contorul se resetează
    await db.update(users).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(users.id, A.userId));
    expect((await call("POST", "/api/auth/login", { body: { email: A.email, password: "parola-sigura-1" } })).status).toBe(200);
    const [u] = await db.select().from(users).where(eq(users.id, A.userId));
    expect(u.failedLogins).toBe(0);
  });

  it("un succes resetează contorul", async () => {
    const A = await seedCabinet("Contor");
    for (let i = 0; i < 3; i++) await call("POST", "/api/auth/login", { body: { email: A.email, password: "gresit" } });
    await call("POST", "/api/auth/login", { body: { email: A.email, password: "parola-sigura-1" } });
    const [u] = await db.select().from(users).where(eq(users.id, A.userId));
    expect(u.failedLogins).toBe(0);
  });
});

describe("limitarea cererilor (Postgres)", () => {
  it("numără atomic în fereastră și o resetează la expirare", async () => {
    const key = unique("rl:");
    const results = await Promise.all(Array.from({ length: 20 }, () => hit(key, 60_000)));
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    await db.execute(sql`update rate_limits set reset_at = now() - interval '1 second' where key = ${key}`);
    expect((await hit(key, 60_000)).count).toBe(1);
  });
});

describe("antete de securitate", () => {
  it("API-ul trimite CSP, HSTS și nosniff", async () => {
    const r = await app.request("/health");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(r.headers.get("strict-transport-security")).toContain("max-age=");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });
});
