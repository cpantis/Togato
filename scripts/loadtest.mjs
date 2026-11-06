#!/usr/bin/env node
/**
 * Test de încărcare simplu pentru API (fără dependențe).
 *   API_URL=http://localhost:8080 CLIENTS=60 CONCURRENCY=20 DURATION=20 node scripts/loadtest.mjs
 * API-ul trebuie pornit cu RATE_LIMIT=off. Creează un cabinet nou cu CLIENTS clienți (2 sisteme fiecare),
 * apoi trimite cereri în paralel la rutele cele mai folosite și raportează p50/p95/p99 și erorile.
 * Clienții de test depășesc limita perioadei de probă: scriptul marchează cabinetul ca activ direct în DB
 * dacă DATABASE_URL e setat; altfel folosește maxim 10 clienți.
 */
const API = process.env.API_URL || "http://localhost:8080";
const CONCURRENCY = Number(process.env.CONCURRENCY || 20);
const DURATION = Number(process.env.DURATION || 20) * 1000;
let CLIENTS = Number(process.env.CLIENTS || 60);

async function req(method, path, token, body) {
  const t0 = performance.now();
  const res = await fetch(API + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, ms: performance.now() - t0, body: text && res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : null };
}

const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0;

async function main() {
  const email = `load${Date.now()}@test.ro`;
  const s = await req("POST", "/api/auth/signup", null, { name: "Test Încărcare", email, password: "parola-de-test-1", cabinetName: "Cabinet Încărcare", acceptTerms: true });
  if (s.status !== 201) throw new Error(`signup: ${s.status} ${JSON.stringify(s.body)}`);
  const token = s.body.token;
  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL);
    await sql`update organizations set status = 'activ', plan = 'enterprise' where id = ${s.body.organization.id}`;
    await sql.end();
  } else {
    CLIENTS = Math.min(CLIENTS, 10);
  }
  process.stdout.write(`Pregătire: ${CLIENTS} clienți × 2 sisteme... `);
  const clientIds = [];
  const systemIds = [];
  for (let i = 0; i < CLIENTS; i++) {
    const c = await req("POST", "/api/clients", token, { name: `Client Încărcare ${String(i).padStart(3, "0")} SRL` });
    if (c.status !== 201) throw new Error(`client: ${c.status} ${JSON.stringify(c.body)}`);
    clientIds.push(c.body.id);
    for (const answers of [{ qualification: "da", annexIII: ["4a_recrutare"], workplace: true }, { qualification: "da", transparency: ["chatbot"] }]) {
      const sy = await req("POST", `/api/clients/${c.body.id}/ai-systems`, token, { name: `Sistem ${i}`, answers });
      systemIds.push(sy.body.id);
    }
  }
  console.log("gata.");

  const routes = [
    () => ["GET", "/api/dashboard"],
    () => ["GET", "/api/clients?limit=50"],
    () => ["GET", `/api/clients/${clientIds[Math.floor(Math.random() * clientIds.length)]}`],
    () => ["GET", `/api/ai-systems/${systemIds[Math.floor(Math.random() * systemIds.length)]}`],
    () => ["GET", "/api/auth/me"],
  ];
  const stats = new Map();
  const end = Date.now() + DURATION;
  let total = 0;
  async function worker() {
    while (Date.now() < end) {
      const [method, path] = routes[Math.floor(Math.random() * routes.length)]();
      const key = path.replace(/[0-9a-f-]{36}/g, ":id").replace(/\?.*/, "");
      const r = await req(method, path, token).catch(() => ({ status: 0, ms: 0 }));
      const st = stats.get(key) ?? { ms: [], errors: 0 };
      st.ms.push(r.ms);
      if (r.status !== 200) st.errors++;
      stats.set(key, st);
      total++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\n${total} cereri în ${DURATION / 1000}s cu ${CONCURRENCY} conexiuni → ${(total / (DURATION / 1000)).toFixed(0)} cereri/s\n`);
  console.log("ruta".padEnd(26), "n".padStart(6), "p50".padStart(8), "p95".padStart(8), "p99".padStart(8), "erori".padStart(6));
  for (const [k, v] of [...stats].sort()) {
    const ms = v.ms.sort((a, b) => a - b);
    console.log(k.padEnd(26), String(ms.length).padStart(6), `${pct(ms, 50).toFixed(0)}ms`.padStart(8), `${pct(ms, 95).toFixed(0)}ms`.padStart(8), `${pct(ms, 99).toFixed(0)}ms`.padStart(8), String(v.errors).padStart(6));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
