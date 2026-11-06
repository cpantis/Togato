/**
 * Verificarea integrărilor pe staging / producție, cu apeluri reale și inofensive:
 *   npm run check:integrations -w @togato/api [-- --email-to=adresa@cabinet.ro]
 * Fiecare integrare configurată primește ✓ sau ✗; cele neconfigurate apar cu „–”. Ieșire ≠ 0 la orice ✗.
 * Nu scrie date ale clienților; obiectul de test din stocare e șters imediat.
 */
import "dotenv/config";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";
import { config, frontendBaseUrl } from "../config";
import { closeDb, rootDb } from "../db";
import { MEMO_MODEL } from "../services/memo";
import { storage } from "../services/storage";
import { clamdScan } from "../services/antivirus";
import { lookupCompany } from "../services/companyLookup";
import { deliver } from "../services/email";

type Result = { name: string; status: "ok" | "fail" | "skip"; detail: string };
const results: Result[] = [];
async function check(name: string, configured: boolean, fn: () => Promise<string>) {
  if (!configured) { results.push({ name, status: "skip", detail: "neconfigurat" }); return; }
  try { results.push({ name, status: "ok", detail: await fn() }); }
  catch (e) { results.push({ name, status: "fail", detail: (e as Error).message.slice(0, 300) }); }
}
const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

async function main() {
  const cfg = config();
  const emailTo = process.argv.find((a) => a.startsWith("--email-to="))?.split("=")[1];

  await check("Postgres", true, async () => {
    const [m] = (await rootDb.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)) as unknown as { n: number }[];
    const [r] = (await rootDb.execute(sql`select count(*)::int as n from pg_roles where rolname = 'togato_app'`)) as unknown as { n: number }[];
    assert(r.n === 1, "rolul togato_app lipsește (rulați migrațiile)");
    return `${m.n} migrații aplicate, rolul RLS există`;
  });

  await check("Anthropic (memoriul AI)", !!cfg.ANTHROPIC_API_KEY, async () => {
    // citirea modelului: verifică cheia și accesul la model, fără cost
    const model = await new Anthropic().models.retrieve(MEMO_MODEL);
    return `cheie validă, model ${model.id} accesibil`;
  });

  await check("Resend (email)", cfg.EMAIL_PROVIDER === "resend", async () => {
    const domain = (cfg.EMAIL_FROM.match(/@([^>\s]+)/)?.[1] ?? "").toLowerCase();
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${cfg.RESEND_API_KEY}` }, signal: AbortSignal.timeout(10_000) });
    assert(res.ok, `API Resend: ${res.status}`);
    const list = ((await res.json()) as { data?: { name: string; status: string }[] }).data ?? [];
    const d = list.find((x) => x.name.toLowerCase() === domain);
    assert(d, `domeniul ${domain} din EMAIL_FROM nu e adăugat în Resend`);
    assert(d!.status === "verified", `domeniul ${domain} nu e verificat (stare: ${d!.status}) — SPF/DKIM`);
    if (emailTo) await deliver({ to: emailTo, subject: "Togato: test de trimitere", html: "<p>Mesaj de test trimis de verificarea integrărilor.</p>", text: "Mesaj de test trimis de verificarea integrărilor." });
    return `domeniul ${domain} verificat${emailTo ? `; email de test trimis la ${emailTo}` : ""}`;
  });
  if (cfg.EMAIL_PROVIDER === "resend" && !cfg.RESEND_WEBHOOK_SECRET) results.push({ name: "Resend webhook", status: "fail", detail: "RESEND_WEBHOOK_SECRET lipsește: adresele care resping emailurile nu vor fi blocate" });

  await check("Stripe (abonamente)", !!cfg.STRIPE_SECRET_KEY, async () => {
    const auth = { Authorization: `Bearer ${cfg.STRIPE_SECRET_KEY}` };
    const out: string[] = [];
    for (const [k, id] of [["STRIPE_PRICE_START", cfg.STRIPE_PRICE_START], ["STRIPE_PRICE_CABINET", cfg.STRIPE_PRICE_CABINET]] as const) {
      assert(id, `${k} lipsește`);
      const r = await fetch(`https://api.stripe.com/v1/prices/${id}`, { headers: auth, signal: AbortSignal.timeout(10_000) });
      assert(r.ok, `${k}: prețul ${id} nu există (${r.status})`);
      const p = (await r.json()) as { active: boolean; unit_amount: number | null; currency: string; recurring: unknown };
      assert(p.active && p.recurring, `${k}: prețul ${id} nu e activ / recurent`);
      out.push(`${k} ${(p.unit_amount ?? 0) / 100} ${p.currency.toUpperCase()}`);
    }
    assert(cfg.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET lipsește");
    const wh = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", { headers: auth, signal: AbortSignal.timeout(10_000) });
    const eps = ((await wh.json()) as { data?: { url: string; status: string }[] }).data ?? [];
    assert(eps.some((e) => e.url.endsWith("/api/stripe/webhook") && e.status === "enabled"), "niciun webhook Stripe activ către /api/stripe/webhook");
    return `${out.join(", ")}; webhook activ; mod ${cfg.STRIPE_SECRET_KEY!.startsWith("sk_live") ? "live" : "test"}`;
  });

  await check(`Stocare (${cfg.STORAGE_DRIVER})`, true, async () => {
    const key = `${crypto.randomUUID()}/healthcheck/${crypto.randomUUID()}`;
    const body = Buffer.from(`togato ${new Date().toISOString()}`);
    await storage().put(key, body, "text/plain");
    const back = await storage().get(key);
    await storage().delete([key]);
    assert(back.equals(body), "conținutul citit diferă de cel scris");
    if (cfg.STORAGE_DRIVER === "local" && cfg.NODE_ENV === "production") throw new Error("STORAGE_DRIVER=local în producție: fișierele se pierd la redeploy");
    return "scriere, citire, ștergere";
  });

  await check("ANAF (căutare după CUI)", true, async () => {
    const c = await lookupCompany("14399840");
    assert(c?.name, "răspuns gol pentru un CUI cunoscut");
    return `CUI 14399840 → ${c!.name}`;
  });

  await check("Antivirus (clamd)", !!cfg.CLAMAV_HOST, async () => {
    const clean = await clamdScan(Buffer.from("fișier curat"), cfg.CLAMAV_HOST!, cfg.CLAMAV_PORT);
    const bad = await clamdScan(Buffer.from(EICAR), cfg.CLAMAV_HOST!, cfg.CLAMAV_PORT);
    assert(clean.clean, "un fișier curat a fost respins");
    assert(!bad.clean, "fișierul de test EICAR NU a fost detectat");
    return `EICAR detectat (${(bad as { signature: string }).signature})`;
  });

  await check("Captcha (Turnstile)", !!cfg.TURNSTILE_SECRET_KEY, async () => {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: cfg.TURNSTILE_SECRET_KEY!, response: "token-invalid-de-test" }), signal: AbortSignal.timeout(10_000) });
    const codes = ((await res.json()) as { "error-codes"?: string[] })["error-codes"] ?? [];
    assert(!codes.includes("invalid-input-secret"), "cheia secretă Turnstile e invalidă");
    return "cheia secretă e acceptată";
  });

  await check("Sentry", !!cfg.SENTRY_DSN, async () => "DSN configurat (erorile 500 se raportează)");

  await check("Configurare de producție", cfg.NODE_ENV === "production", async () => {
    const issues: string[] = [];
    if (!frontendBaseUrl().startsWith("https://")) issues.push("FRONTEND_URL nu e https");
    if (cfg.EMAIL_PROVIDER !== "resend") issues.push("EMAIL_PROVIDER nu e resend");
    if (!cfg.PLATFORM_ADMIN_EMAILS.trim()) issues.push("PLATFORM_ADMIN_EMAILS gol (alertele nu ajung la nimeni)");
    if (cfg.TRUST_PROXY_HOPS === 0) issues.push("TRUST_PROXY_HOPS=0 (limitarea cererilor vede IP-ul proxy-ului)");
    assert(!issues.length, issues.join("; "));
    return "FRONTEND_URL https, email real, alerte, proxy";
  });

  const icon = { ok: "✓", fail: "✗", skip: "–" } as const;
  for (const r of results) console.log(`${icon[r.status]} ${r.name.padEnd(28)} ${r.detail}`);
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(failed ? `\n${failed} verificări au eșuat.` : "\nToate integrările configurate funcționează.");
  await closeDb();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await closeDb().catch(() => {}); process.exit(1); });
