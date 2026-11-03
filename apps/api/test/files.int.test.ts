/** Dovezi, arhivarea clienților, logo-ul cabinetului și exportul dosarului. */
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import fs from "fs";
import path from "path";
import { db } from "../src/db";
import { evidence } from "../src/db/schema";
import { app } from "../src/app";
import { drain } from "../src/jobs/queue";
import { handlers } from "../src/jobs/handlers";
import { call, seedCabinet, upload } from "./helpers";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const localFile = (key: string) => path.join(path.resolve(process.env.STORAGE_LOCAL_DIR!), key);

async function runJobs() {
  await db.execute(sql`update jobs set run_at = now() where status = 'pending'`);
  await drain(handlers);
}

describe("dovezi atașate obligațiilor", () => {
  it("încărcare, listă, descărcare identică, ștergere (inclusiv din stocare)", async () => {
    const A = await seedCabinet("Dovezi");
    const content = Buffer.from("%PDF-1.4\nprocesul-verbal al instruirii\n");
    const up = await upload(`/api/obligations/${A.obligationId}/evidence`, A.token, "Instruire angajați.pdf", content, { note: "semnat" });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ fileName: "Instruire angajați.pdf", contentType: "application/pdf", size: content.length, note: "semnat" });

    const list = await call("GET", `/api/obligations/${A.obligationId}/evidence`, { token: A.token });
    expect(list.body.data.map((e: any) => e.id)).toContain(up.body.id);

    const dl = await app.request(`/api/evidence/${up.body.id}`, { headers: { authorization: `Bearer ${A.token}` } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(Buffer.from(await dl.arrayBuffer()).equals(content)).toBe(true);

    const [row] = await db.select().from(evidence).where(eq(evidence.id, up.body.id));
    expect(fs.existsSync(localFile(row.storageKey))).toBe(true);
    expect((await call("DELETE", `/api/evidence/${up.body.id}`, { token: A.token })).status).toBe(204);
    await runJobs();
    expect(fs.existsSync(localFile(row.storageKey))).toBe(false);
  });

  it("respinge fișierele cu conținut nepermis, chiar cu extensie permisă", async () => {
    const A = await seedCabinet("Dovezi Rele");
    const bad = await upload(`/api/obligations/${A.obligationId}/evidence`, A.token, "dovada.pdf", Buffer.from("<html><script>alert(1)</script></html>"));
    expect(bad.status).toBe(400);
    const empty = await upload(`/api/obligations/${A.obligationId}/evidence`, A.token, "gol.pdf", Buffer.alloc(0));
    expect(empty.status).toBe(400);
  });

  it("fișierele mai mari de 15 MB sunt refuzate", async () => {
    const A = await seedCabinet("Dovezi Mari");
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(16 * 1024 * 1024)]);
    const r = await upload(`/api/obligations/${A.obligationId}/evidence`, A.token, "mare.pdf", big);
    expect([400, 413]).toContain(r.status);
  });
});

describe("arhivarea clienților", () => {
  it("clientul arhivat dispare din listă și panou, portalul nu mai merge, se poate dezarhiva", async () => {
    const A = await seedCabinet("Arhivă");
    const token = A.portalUrl.split("/portal/")[1];
    expect((await call("GET", `/api/portal/${token}`)).status).toBe(200);
    const before = await call("GET", "/api/dashboard", { token: A.token });

    expect((await call("POST", `/api/clients/${A.clientId}/archive`, { token: A.token })).status).toBe(200);
    expect((await call("GET", "/api/clients", { token: A.token })).body.data.some((c: any) => c.id === A.clientId)).toBe(false);
    expect((await call("GET", "/api/clients?archived=1", { token: A.token })).body.data.map((c: any) => c.id)).toContain(A.clientId);
    expect((await call("GET", `/api/portal/${token}`)).status).toBe(404);
    const after = await call("GET", "/api/dashboard", { token: A.token });
    expect(after.body.clients).toBe(before.body.clients - 1);
    // datele rămân accesibile direct
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: A.token })).body.archivedAt).toBeTruthy();

    expect((await call("POST", `/api/clients/${A.clientId}/unarchive`, { token: A.token })).status).toBe(200);
    expect((await call("GET", "/api/clients", { token: A.token })).body.data.map((c: any) => c.id)).toContain(A.clientId);
  });

  it("ștergerea definitivă cere arhivare, confirmarea denumirii și rol de administrator; șterge și fișierele", async () => {
    const A = await seedCabinet("Ștergere");
    const detail = await call("GET", `/api/clients/${A.clientId}`, { token: A.token });
    const name = detail.body.name as string;
    const r1 = await call("DELETE", `/api/clients/${A.clientId}?confirm=${encodeURIComponent(name)}`, { token: A.token });
    expect(r1.status).toBe(409);
    await call("POST", `/api/clients/${A.clientId}/archive`, { token: A.token });
    expect((await call("DELETE", `/api/clients/${A.clientId}?confirm=altceva`, { token: A.token })).status).toBe(400);
    const [ev] = await db.select().from(evidence).where(eq(evidence.clientId, A.clientId));
    expect((await call("DELETE", `/api/clients/${A.clientId}?confirm=${encodeURIComponent(name)}`, { token: A.token })).status).toBe(204);
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: A.token })).status).toBe(404);
    await runJobs();
    expect(fs.existsSync(localFile(ev.storageKey))).toBe(false);
  });
});

describe("logo-ul cabinetului", () => {
  it("încărcare PNG, servit public cu antete stricte; SVG refuzat", async () => {
    const A = await seedCabinet("Logo");
    const svg = await upload("/api/organization/logo", A.token, "logo.svg", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"));
    expect(svg.status).toBe(400);
    const up = await upload("/api/organization/logo", A.token, "logo.png", PNG);
    expect(up.status).toBe(200);
    expect(up.body.logoUploaded).toBe(true);
    expect(up.body.logoSrc).toMatch(/^\/api\/public\/logo\/[0-9a-f-]{36}\?v=/);
    const pub = await app.request(up.body.logoSrc);
    expect(pub.status).toBe(200);
    expect(pub.headers.get("content-type")).toBe("image/png");
    expect(pub.headers.get("content-security-policy")).toContain("default-src 'none'");
    // portalul afișează logo-ul încărcat
    const token = A.portalUrl.split("/portal/")[1];
    expect((await call("GET", `/api/portal/${token}`)).body.cabinet.logoUrl).toBe(up.body.logoSrc);
    const del = await call("DELETE", "/api/organization/logo", { token: A.token });
    expect(del.body.logoSrc).toBeNull();
    expect((await app.request(up.body.logoSrc)).status).toBe(404);
  });
});

describe("exportul dosarului", () => {
  it("ZIP cu date, avize PDF verificate, documente, dovezi și jurnal", async () => {
    const A = await seedCabinet("Export");
    const res = await app.request(`/api/clients/${A.clientId}/export`, { headers: { authorization: `Bearer ${A.token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const names = Object.keys(files);
    expect(names).toEqual(expect.arrayContaining(["CITESTE-MA.txt", "dosar.json", "obligatii.csv", "sisteme_ai.csv", "jurnal_activitate.csv"]));
    expect(names.some((n) => n.startsWith("avize/") && n.endsWith(".pdf"))).toBe(true);
    expect(names.some((n) => n.startsWith("documente/") && n.endsWith(".docx"))).toBe(true);
    const evFile = names.find((n) => n.startsWith("dovezi/"))!;
    expect(strFromU8(files[evFile])).toContain("dovadă de test");
    const dossier = JSON.parse(strFromU8(files["dosar.json"]));
    expect(dossier.snapshots[0].integrity).toBe("ok");
    expect(dossier.systems[0].name).toBe("Filtrare CV");
    expect(strFromU8(files["jurnal_activitate.csv"])).toContain("review");
  });
});
