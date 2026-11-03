/** Abonamente: limitele planului, expirarea probei, suspendarea, webhook-urile Stripe, Checkout. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { rootDb } from "../src/db";
import { organizations } from "../src/db/schema";
import { app } from "../src/app";
import { _resetConfig } from "../src/config";
import { _setStripe } from "../src/services/billing";
import { call, seedCabinet, unique } from "./helpers";

const WH_SECRET = "whsec_test_secret_123";
const signer = new Stripe("sk_test_unused");

async function orgIdOf(clientId: string) {
  const rows = await rootDb.execute<{ organization_id: string }>(sql`select organization_id from clients where id = ${clientId}`);
  return (rows as unknown as { organization_id: string }[])[0].organization_id;
}

function webhook(event: Record<string, unknown>, secret = WH_SECRET) {
  const payload = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({ payload, secret });
  return app.request("/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
}

function subscriptionEvent(type: string, orgId: string, status: string, price = "price_cabinet_test") {
  return {
    id: unique("evt_"), object: "event", type, api_version: "2025-01-27",
    data: { object: { id: `sub_${orgId.slice(0, 8)}`, object: "subscription", customer: `cus_${orgId.slice(0, 8)}`, status, cancel_at_period_end: false,
      metadata: { organizationId: orgId }, items: { data: [{ price: { id: price }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] } } },
  };
}

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
  process.env.STRIPE_PRICE_START = "price_start_test";
  process.env.STRIPE_PRICE_CABINET = "price_cabinet_test";
  _resetConfig();
});
afterAll(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_START;
  delete process.env.STRIPE_PRICE_CABINET;
  _setStripe(null);
  _resetConfig();
});

describe("limitele planului", () => {
  it("în probă: maximum 10 clienți activi; arhivarea eliberează un loc", async () => {
    const A = await seedCabinet("Limite");
    const ids: string[] = [A.clientId];
    for (let i = 2; i <= 10; i++) {
      const r = await call("POST", "/api/clients", { token: A.token, body: { name: `Client ${i} SRL` } });
      expect(r.status).toBe(201);
      ids.push(r.body.id);
    }
    const over = await call("POST", "/api/clients", { token: A.token, body: { name: "Al unsprezecelea SRL" } });
    expect(over.status).toBe(402);
    expect(over.body.code).toBe("plan_limit");
    await call("POST", `/api/clients/${ids[1]}/archive`, { token: A.token });
    expect((await call("POST", "/api/clients", { token: A.token, body: { name: "Al unsprezecelea SRL" } })).status).toBe(201);
    // reactivarea celui arhivat ar depăși limita
    expect((await call("POST", `/api/clients/${ids[1]}/unarchive`, { token: A.token })).status).toBe(402);
  });

  it("utilizatorii: membrii activi + invitațiile în așteptare", async () => {
    const A = await seedCabinet("Locuri"); // admin + 1 invitație
    for (let i = 0; i < 3; i++) expect((await call("POST", "/api/team/invitations", { token: A.token, body: { email: `${unique("u")}@x.ro`, sendEmail: false } })).status).toBe(201);
    const over = await call("POST", "/api/team/invitations", { token: A.token, body: { email: `${unique("u")}@x.ro`, sendEmail: false } });
    expect(over.status).toBe(402);
  });
});

describe("starea abonamentului", () => {
  it("proba expirată: doar citire și export; facturarea și contul rămân accesibile", async () => {
    const A = await seedCabinet("Expirat");
    const orgId = await orgIdOf(A.clientId);
    await rootDb.update(organizations).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(organizations.id, orgId));
    const w = await call("POST", "/api/clients", { token: A.token, body: { name: "Nou SRL" } });
    expect(w.status).toBe(402);
    expect(w.body.code).toBe("subscription_required");
    expect((await call("PATCH", `/api/obligations/${A.obligationId}`, { token: A.token, body: { status: "in_lucru" } })).status).toBe(402);
    expect((await call("GET", `/api/clients/${A.clientId}`, { token: A.token })).status).toBe(200);
    expect((await app.request(`/api/clients/${A.clientId}/export`, { headers: { authorization: `Bearer ${A.token}` } })).status).toBe(200);
    const b = await call("GET", "/api/billing", { token: A.token });
    expect(b.body.state).toBe("expirat");
    expect((await call("PUT", "/api/account/notifications", { token: A.token, body: { notifyPortal: false } })).status).toBe(200);
  });

  it("cabinetul suspendat nu are acces", async () => {
    const A = await seedCabinet("Suspendat");
    const orgId = await orgIdOf(A.clientId);
    await rootDb.update(organizations).set({ status: "suspendat" }).where(eq(organizations.id, orgId));
    const r = await call("GET", "/api/clients", { token: A.token });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("suspended");
  });
});

describe("webhook-urile Stripe", () => {
  it("semnătura e verificată", async () => {
    const A = await seedCabinet("Semnătură");
    const orgId = await orgIdOf(A.clientId);
    expect((await webhook(subscriptionEvent("customer.subscription.updated", orgId, "active"), "whsec_alt")).status).toBe(400);
    const unsigned = await app.request("/api/stripe/webhook", { method: "POST", body: JSON.stringify(subscriptionEvent("customer.subscription.updated", orgId, "active")) });
    expect(unsigned.status).toBe(400);
    const [org] = await rootDb.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org.subscriptionStatus).toBeNull();
  });

  it("abonament activ → plan, limite noi, scrieri permise; evenimentele duplicate sunt ignorate; anularea → expirat", async () => {
    const A = await seedCabinet("Abonat");
    const orgId = await orgIdOf(A.clientId);
    await rootDb.update(organizations).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(organizations.id, orgId));
    const ev = subscriptionEvent("customer.subscription.created", orgId, "active");
    const r1 = await webhook(ev);
    expect(r1.status).toBe(200);
    expect((await r1.json()).duplicate).toBe(false);
    expect((await (await webhook(ev)).json()).duplicate).toBe(true);

    const b = await call("GET", "/api/billing", { token: A.token });
    expect(b.body).toMatchObject({ state: "activ", plan: "cabinet", limits: { maxClients: 75, maxUsers: 20 } });
    expect((await call("POST", "/api/clients", { token: A.token, body: { name: "Plătit SRL" } })).status).toBe(201);

    await webhook(subscriptionEvent("customer.subscription.updated", orgId, "past_due"));
    expect((await call("GET", "/api/billing", { token: A.token })).body.state).toBe("restant");
    expect((await call("POST", "/api/clients", { token: A.token, body: { name: "Restant SRL" } })).status).toBe(201);

    await webhook(subscriptionEvent("customer.subscription.deleted", orgId, "canceled"));
    expect((await call("GET", "/api/billing", { token: A.token })).body.state).toBe("expirat");
    expect((await call("POST", "/api/clients", { token: A.token, body: { name: "Anulat SRL" } })).status).toBe(402);
  });
});

describe("Checkout", () => {
  it("doar administratorul; sesiunea poartă cabinetul; starea NU se schimbă la redirecționare", async () => {
    const calls: Record<string, any[]> = { customers: [], sessions: [] };
    _setStripe({
      customers: { create: async (args: any) => { calls.customers.push(args); return { id: "cus_fake_1" }; } },
      checkout: { sessions: { create: async (args: any) => { calls.sessions.push(args); return { url: "https://checkout.stripe.com/c/pay/test" }; } } },
      billingPortal: { sessions: { create: async () => ({ url: "https://billing.stripe.com/p/test" }) } },
    } as unknown as Stripe);
    const A = await seedCabinet("Checkout");
    const orgId = await orgIdOf(A.clientId);
    const r = await call("POST", "/api/billing/checkout", { token: A.token, body: { plan: "start" } });
    expect(r.status).toBe(200);
    expect(r.body.url).toBe("https://checkout.stripe.com/c/pay/test");
    expect(calls.sessions[0]).toMatchObject({ mode: "subscription", customer: "cus_fake_1", client_reference_id: orgId, line_items: [{ price: "price_start_test", quantity: 1 }] });
    expect((await call("GET", "/api/billing", { token: A.token })).body.state).toBe("proba");
    expect((await call("POST", "/api/billing/portal", { token: A.token })).body.url).toContain("billing.stripe.com");
    _setStripe(null);
  });
});
