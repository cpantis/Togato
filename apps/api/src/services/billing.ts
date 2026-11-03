/**
 * Abonamentele: starea de facturare, limitele planului și integrarea Stripe (Checkout,
 * portalul de facturare, webhook-uri verificate). Starea abonamentului se schimbă DOAR din
 * webhook-uri semnate — niciodată din redirecționarea browserului după plată.
 */
import Stripe from "stripe";
import { and, eq, isNull, sql } from "drizzle-orm";
import { PLANS, billingState, effectiveLimits, planDef, type BillingState, type PlanCode } from "@togato/shared";
import { db, rootDb } from "../db";
import { clients, invitations, organizations, stripeEvents, users } from "../db/schema";
import { config, frontendBaseUrl } from "../config";
import { log } from "../lib/logger";

let client: Stripe | null = null;
/** clientul Stripe (null dacă STRIPE_SECRET_KEY lipsește); înlocuibil în teste */
export function stripe(): Stripe | null {
  if (client) return client;
  const key = config().STRIPE_SECRET_KEY;
  if (!key) return null;
  client = new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 });
  return client;
}
export function _setStripe(s: Stripe | null) { client = s; }

export function priceFor(plan: PlanCode): string | null {
  const c = config();
  return plan === "start" ? c.STRIPE_PRICE_START ?? null : plan === "cabinet" ? c.STRIPE_PRICE_CABINET ?? null : null;
}

export function planForPrice(priceId: string | null | undefined): PlanCode | null {
  if (!priceId) return null;
  if (priceId === config().STRIPE_PRICE_START) return "start";
  if (priceId === config().STRIPE_PRICE_CABINET) return "cabinet";
  return null;
}

type Org = typeof organizations.$inferSelect;

export function stateOf(org: Org, now = new Date()): BillingState {
  return billingState({ status: org.status, trialEndsAt: org.trialEndsAt, subscriptionStatus: org.subscriptionStatus }, now);
}

export async function usage(organizationId: string) {
  const [{ n: activeClients }] = await db.select({ n: sql<number>`count(*)::int` }).from(clients)
    .where(and(eq(clients.organizationId, organizationId), isNull(clients.archivedAt)));
  const [{ n: activeUsers }] = await db.select({ n: sql<number>`count(*)::int` }).from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.status, "activ")));
  const [{ n: pendingInvites }] = await db.select({ n: sql<number>`count(*)::int` }).from(invitations)
    .where(and(eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt), sql`${invitations.expiresAt} > now()`));
  return { activeClients, activeUsers, pendingInvites };
}

export class PlanLimitError extends Error {
  constructor(message: string, public code: "plan_limit" | "subscription_required" = "plan_limit") { super(message); }
}

/** verifică dacă se mai poate adăuga un client / un utilizator; aruncă PlanLimitError altfel */
export async function assertCanAdd(organizationId: string, what: "client" | "user") {
  const org = (await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) }))!;
  const state = stateOf(org);
  const limits = effectiveLimits(state, org.plan);
  const u = await usage(organizationId);
  if (what === "client" && limits.maxClients !== null && u.activeClients >= limits.maxClients) {
    throw new PlanLimitError(`Ați atins limita de ${limits.maxClients} clienți activi ${state === "proba" ? "din perioada de probă" : `a planului ${planDef(org.plan).name}`}. Arhivați clienții inactivi sau treceți la un plan superior.`);
  }
  if (what === "user" && limits.maxUsers !== null && u.activeUsers + u.pendingInvites >= limits.maxUsers) {
    throw new PlanLimitError(`Ați atins limita de ${limits.maxUsers} utilizatori (inclusiv invitațiile în așteptare). Dezactivați un cont, anulați o invitație sau treceți la un plan superior.`);
  }
}

export async function billingSummary(organizationId: string) {
  const org = (await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) }))!;
  const state = stateOf(org);
  return {
    state,
    plan: org.plan,
    trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
    subscriptionStatus: org.subscriptionStatus,
    currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    limits: effectiveLimits(state, org.plan),
    usage: await usage(organizationId),
    onlinePayments: !!stripe(),
    hasCustomer: !!org.stripeCustomerId,
    plans: PLANS.map((p) => ({ ...p, purchasable: p.selfServe && !!priceFor(p.code) && !!stripe() })),
  };
}

export async function createCheckout(org: Org, plan: PlanCode, user: { email: string }) {
  const s = stripe();
  const price = priceFor(plan);
  if (!s || !price) throw new PlanLimitError("Plata online nu este configurată. Contactați-ne pentru activarea abonamentului.");
  let customer = org.stripeCustomerId;
  if (!customer) {
    const c = await s.customers.create({ name: org.name, email: user.email, metadata: { organizationId: org.id } }, { idempotencyKey: `customer-${org.id}` });
    customer = c.id;
    await db.update(organizations).set({ stripeCustomerId: customer }).where(eq(organizations.id, org.id));
  }
  const base = frontendBaseUrl();
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: org.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { organizationId: org.id, plan } },
    metadata: { organizationId: org.id, plan },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    allow_promotion_codes: true,
    success_url: `${base}/settings?abonament=ok#abonament`,
    cancel_url: `${base}/settings#abonament`,
    locale: "ro",
  });
  return session.url!;
}

export async function createPortal(org: Org) {
  const s = stripe();
  if (!s || !org.stripeCustomerId) throw new PlanLimitError("Nu există încă un abonament de gestionat.");
  const session = await s.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: `${frontendBaseUrl()}/settings#abonament`, locale: "ro" });
  return session.url;
}

/** aplică starea unui abonament Stripe pe cabinet (din webhook) */
async function applySubscription(sub: Stripe.Subscription, organizationIdHint?: string | null) {
  const organizationId = sub.metadata?.organizationId || organizationIdHint;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const where = organizationId ? eq(organizations.id, organizationId) : eq(organizations.stripeCustomerId, customerId);
  const item = sub.items.data[0];
  const plan = planForPrice(item?.price?.id) ?? (sub.metadata?.plan as PlanCode | undefined) ?? null;
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  const [org] = await rootDb.update(organizations).set({
    stripeCustomerId: customerId,
    stripeSubscriptionId: ended ? null : sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    ...(plan ? { plan } : {}),
    // după prima plată, cabinetul iese din „trial”; suspendarea de către platformă rămâne neatinsă
    ...(sub.status === "active" ? { status: sql`case when ${organizations.status} = 'suspendat' then 'suspendat'::org_status else 'activ'::org_status end` } : {}),
  }).where(where).returning({ id: organizations.id });
  if (!org) log.warn("webhook Stripe fără cabinet corespunzător", { subscription: sub.id, customer: customerId });
  else log.info("abonament actualizat", { organizationId: org.id, status: sub.status, plan });
}

/** procesează un eveniment Stripe verificat; idempotent (fiecare id o singură dată) */
export async function handleStripeEvent(event: Stripe.Event) {
  const fresh = await rootDb.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: stripeEvents.id });
  if (!fresh.length) return { duplicate: true };
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe()!.subscriptions.retrieve(subId);
          await applySubscription(sub, session.client_reference_id ?? session.metadata?.organizationId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (e) {
    // procesarea a eșuat: ștergem marcajul ca Stripe să poată retrimite evenimentul
    await rootDb.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    throw e;
  }
  return { duplicate: false };
}

export function verifyWebhook(rawBody: string, signature: string | undefined): Stripe.Event {
  const secret = config().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET lipsește");
  if (!signature) throw new Error("lipsește antetul Stripe-Signature");
  // verificarea nu face cereri în rețea; un client fără cheie validă e suficient
  return (stripe() ?? new Stripe("sk_unused")).webhooks.constructEvent(rawBody, signature, secret, 300);
}
