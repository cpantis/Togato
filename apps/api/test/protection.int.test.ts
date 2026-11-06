/** Protecții opționale pentru producție: antivirus (clamd), captcha (Turnstile), adrese blocate (webhook Resend). */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import net from "net";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { LEGAL_VERSION } from "@togato/shared";
import { rootDb } from "../src/db";
import { emailSuppressions } from "../src/db/schema";
import { _resetConfig } from "../src/config";
import { deliver, _clearOutbox, sentEmails } from "../src/services/email";
import { verifySvix } from "../src/routes/emailWebhook";
import { app } from "../src/app";
import { call, seedCabinet, unique, upload } from "./helpers";

const ENV_KEYS = ["CLAMAV_HOST", "CLAMAV_PORT", "CLAMAV_FAIL_OPEN", "TURNSTILE_SECRET_KEY", "RESEND_WEBHOOK_SECRET"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  _resetConfig();
}
afterEach(() => { setEnv(saved); vi.restoreAllMocks(); });

/** un clamd minimal: citește fluxul INSTREAM și răspunde OK sau FOUND (dacă fișierul conține „EICAR”) */
function fakeClamd(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      const start = buf.indexOf(0) + 1; // după „zINSTREAM\0”
      if (start <= 0) return;
      let pos = start; const parts: Buffer[] = [];
      while (pos + 4 <= buf.length) {
        const len = buf.readUInt32BE(pos);
        if (len === 0) {
          const content = Buffer.concat(parts).toString("latin1");
          sock.end(content.includes("EICAR") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
          return;
        }
        if (pos + 4 + len > buf.length) return;
        parts.push(buf.subarray(pos + 4, pos + 4 + len)); pos += 4 + len;
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    port: (server.address() as net.AddressInfo).port,
    close: () => new Promise((r) => server.close(() => r())),
  })));
}

describe("antivirus (clamd)", () => {
  it("fișierele curate trec, cele infectate sunt respinse; clamd indisponibil → refuz (sau acceptare, la cerere)", async () => {
    const A = await seedCabinet("Antivirus");
    const clam = await fakeClamd();
    setEnv({ CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(clam.port) });
    const pdf = (s: string) => Buffer.from(`%PDF-1.4\n${s}\n`);
    expect((await upload(`/api/obligations/${A.obligationId}/evidence`, A.token, "curat.pdf", pdf("raport"))).status).toBe(201);
    const bad = await upload(`/api/obligations/${A.obligationId}/evidence`, A.token, "virus.pdf", pdf("X5O!P%@AP EICAR-STANDARD-ANTIVIRUS-TEST-FILE"));
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("infected");
    await clam.close();
    const down = await upload(`/api/obligations/${A.obligationId}/evidence`, A.token, "x.pdf", pdf("raport"));
    expect(down.status).toBe(503);
    expect(down.body.code).toBe("scan_unavailable");
    setEnv({ CLAMAV_FAIL_OPEN: "on" });
    expect((await upload(`/api/obligations/${A.obligationId}/evidence`, A.token, "x.pdf", pdf("raport"))).status).toBe(201);
  });
});

describe("captcha (Turnstile)", () => {
  function mockTurnstile() {
    const real = globalThis.fetch;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("challenges.cloudflare.com")) return real(input, init);
      const token = new URLSearchParams(String(init?.body)).get("response");
      return Response.json({ success: token === "bun", "error-codes": token === "bun" ? [] : ["invalid-input-response"] });
    });
  }
  it("înregistrarea și autoevaluarea cer un token valid când e configurat", async () => {
    setEnv({ TURNSTILE_SECRET_KEY: "secret-test" });
    const spy = mockTurnstile();
    const body = (extra: object) => ({ name: "Ana Pop", email: `${unique("cap")}@x.ro`, password: "parola-sigura-1", cabinetName: "Cabinet Captcha", acceptTerms: true, legalVersion: LEGAL_VERSION, ...extra });
    const none = await call("POST", "/api/auth/signup", { body: body({}) });
    expect(none.body.code).toBe("captcha_required");
    expect((await call("POST", "/api/auth/signup", { body: body({ captchaToken: "rau" }) })).body.code).toBe("captcha_failed");
    expect((await call("POST", "/api/auth/signup", { body: body({ captchaToken: "bun" }) })).status).toBe(201);
    const self = { companyName: "Firma Captcha SRL", contactName: "Ion Pop", contactEmail: `${unique("f")}@firma.ro`, terms: true };
    expect((await call("POST", "/api/self-assessments", { body: self })).status).toBe(400);
    expect((await call("POST", "/api/self-assessments", { body: { ...self, captchaToken: "bun" } })).status).toBe(201);
    expect((await call("POST", "/api/self-assessment-recovery", { body: { email: self.contactEmail } })).status).toBe(400);
    expect(spy).toHaveBeenCalled();
  });
});

describe("adrese blocate (webhook Resend)", () => {
  const secretBytes = crypto.randomBytes(24);
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const sign = (id: string, ts: number, body: string) => `v1,${crypto.createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const post = (payload: object, opts: { badSig?: boolean; ts?: number } = {}) => {
    const body = JSON.stringify(payload);
    const ts = opts.ts ?? Math.floor(Date.now() / 1000);
    const id = `msg_${crypto.randomUUID()}`;
    return app.request("/api/email/webhook", { method: "POST", body, headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": String(ts), "svix-signature": opts.badSig ? "v1,AAAA" : sign(id, ts, body) } });
  };

  it("semnătura e obligatorie și verificată", async () => {
    setEnv({ RESEND_WEBHOOK_SECRET: secret });
    expect((await post({ type: "email.bounced", data: { to: ["a@b.ro"] } }, { badSig: true })).status).toBe(400);
    expect((await post({ type: "email.bounced", data: { to: ["a@b.ro"] } }, { ts: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400);
    expect(verifySvix(secret, { id: "x", timestamp: "1", signature: "v1,x" }, "{}")).toBe(false);
  });

  it("respingerea permanentă și reclamația blochează adresa; cea temporară nu", async () => {
    setEnv({ RESEND_WEBHOOK_SECRET: secret });
    const bounced = `${unique("b")}@x.ro`, spam = `${unique("s")}@x.ro`, soft = `${unique("t")}@x.ro`;
    expect((await post({ type: "email.bounced", data: { to: [bounced.toUpperCase()], bounce: { type: "Permanent", message: "mailbox does not exist" } } })).status).toBe(200);
    await post({ type: "email.complained", data: { to: [spam] } });
    await post({ type: "email.bounced", data: { to: [soft], bounce: { type: "Transient" } } });
    const rows = await rootDb.select().from(emailSuppressions);
    expect(rows.map((r) => r.email)).toEqual(expect.arrayContaining([bounced, spam]));
    expect(rows.some((r) => r.email === soft)).toBe(false);

    _clearOutbox();
    await deliver({ to: bounced, subject: "test", html: "<p>x</p>", text: "x" });
    await deliver({ to: soft, subject: "test", html: "<p>x</p>", text: "x" });
    expect(sentEmails().map((m) => m.to)).toEqual([soft]);
    await rootDb.delete(emailSuppressions).where(eq(emailSuppressions.email, bounced));
  });
});

afterAll(() => setEnv(saved));
