/** Rolul de colaborator (doar citire, doar clienții atribuiți) și clienții cu acces restricționat. */
import { describe, expect, it } from "vitest";
import { call, seedCabinet, unique } from "./helpers";

async function addMember(adminToken: string, role: "membru" | "colaborator") {
  const inv = await call("POST", "/api/team/invitations", { token: adminToken, body: { email: `${unique(role)}@x.ro`, role, sendEmail: false } });
  const acc = await call("POST", "/api/auth/accept-invitation", { body: { token: inv.body.url.split("/invite/")[1], name: `Coleg ${role}`, password: "parola-coleg-1" } });
  if (acc.status !== 201 && acc.status !== 200) throw new Error(JSON.stringify(acc.body));
  return { token: acc.body.token as string, userId: acc.body.user.id as string };
}

describe("client cu acces restricționat", () => {
  it("vizibil doar administratorilor, responsabilului și membrilor cu acces; inclusiv datele lui", async () => {
    const A = await seedCabinet("Acces Restrictionat");
    const m1 = await addMember(A.token, "membru");
    const m2 = await addMember(A.token, "membru");
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: m1.token })).status).toBe(200);

    // un membru nu poate restricționa
    expect((await call("PUT", `/api/clients/${A.clientId}/access`, { token: m1.token, body: { restricted: true, userIds: [] } })).status).toBe(403);
    expect((await call("PUT", `/api/clients/${A.clientId}/access`, { token: A.token, body: { restricted: true, userIds: [m2.userId] } })).status).toBe(200);

    // m1: nu vede clientul, nici sistemele, obligațiile, dovezile sau GDPR-ul lui
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: m1.token })).status).toBe(404);
    expect((await call("GET", `/api/ai-systems/${A.systemId}`, { token: m1.token })).status).toBe(404);
    expect((await call("GET", `/api/evidence/${A.evidenceId}`, { token: m1.token })).status).toBe(404);
    expect((await call("GET", `/api/processing/${A.processingId}/dpia`, { token: m1.token })).status).toBe(404);
    const list = await call("GET", "/api/clients", { token: m1.token });
    expect(list.body.data.some((c: { id: string }) => c.id === A.clientId)).toBe(false);
    expect((await call("PATCH", `/api/obligations/${A.obligationId}`, { token: m1.token, body: { status: "finalizat" } })).status).toBe(404);

    // m2 (acces explicit) și adminul văd tot
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: m2.token })).body.restricted).toBe(true);
    expect((await call("GET", `/api/ai-systems/${A.systemId}`, { token: m2.token })).status).toBe(200);
    const access = await call("GET", `/api/clients/${A.clientId}/access`, { token: A.token });
    expect(access.body.members.find((m: { userId: string }) => m.userId === m1.userId).sees).toBe(false);
    expect(access.body.members.find((m: { userId: string }) => m.userId === m2.userId).sees).toBe(true);

    // responsabilul vede clientul fără acces explicit; doar adminul îl schimbă
    expect((await call("PATCH", `/api/clients/${A.clientId}/responsible`, { token: m2.token, body: { userId: m1.userId } })).status).toBe(403);
    expect((await call("PATCH", `/api/clients/${A.clientId}/responsible`, { token: A.token, body: { userId: m1.userId } })).status).toBe(200);
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: m1.token })).status).toBe(200);

    // ridicarea restricției
    await call("PUT", `/api/clients/${A.clientId}/access`, { token: A.token, body: { restricted: false, userIds: [] } });
    expect((await call("GET", `/api/ai-systems/${A.systemId}`, { token: m2.token })).status).toBe(200);
  });

  it("un membru din alt cabinet nu poate primi acces", async () => {
    const A = await seedCabinet("Acces Strain A");
    const B = await seedCabinet("Acces Strain B");
    expect((await call("PUT", `/api/clients/${A.clientId}/access`, { token: A.token, body: { restricted: true, userIds: [B.userId] } })).status).toBe(400);
  });
});

describe("colaborator", () => {
  it("vede doar clienții atribuiți, doar în citire; nu poate fi responsabil", async () => {
    const A = await seedCabinet("Acces Colaborator");
    const col = await addMember(A.token, "colaborator");
    expect((await call("GET", "/api/auth/me", { token: col.token })).body.user.role).toBe("colaborator");
    expect((await call("GET", "/api/clients", { token: col.token })).body.data).toHaveLength(0);
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: col.token })).status).toBe(404);

    await call("PUT", `/api/clients/${A.clientId}/access`, { token: A.token, body: { restricted: false, userIds: [col.userId] } });
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: col.token })).status).toBe(200);
    expect((await call("GET", `/api/ai-systems/${A.systemId}`, { token: col.token })).status).toBe(200);

    const w = await call("POST", "/api/clients", { token: col.token, body: { name: "Nou SRL" } });
    expect(w.status).toBe(403);
    expect(w.body.code).toBe("read_only");
    expect((await call("PATCH", `/api/obligations/${A.obligationId}`, { token: col.token, body: { status: "finalizat" } })).status).toBe(403);
    // contul propriu rămâne editabil
    expect((await call("PUT", "/api/account/notifications", { token: col.token, body: { notifyDeadlines: false, notifyPortal: true } })).status).toBe(200);
    expect((await call("PATCH", `/api/clients/${A.clientId}/responsible`, { token: A.token, body: { userId: col.userId } })).status).toBe(400);
  });
});
