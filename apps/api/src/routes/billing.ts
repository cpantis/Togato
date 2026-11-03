/** Abonamentul cabinetului (/api/billing) și webhook-ul Stripe (/api/stripe/webhook, public). */
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { requireAdmin } from "../middleware/requireAdmin";
import { log, serializeError } from "../lib/logger";
import { billingSummary, createCheckout, createPortal, handleStripeEvent, verifyWebhook } from "../services/billing";

export const billingRoutes = new Hono<AppEnv>();

billingRoutes.get("/", async (c) => c.json(await billingSummary(c.get("auth").organizationId)));

/** POST /checkout { plan } — pagina de plată Stripe (doar administratori) */
billingRoutes.post("/checkout", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const { plan } = z.object({ plan: z.enum(["start", "cabinet"]) }).parse(await c.req.json());
  const org = (await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId) }))!;
  const url = await createCheckout(org, plan, { email: auth.email });
  await audit(auth, "checkout", "organization", auth.organizationId, { plan });
  return c.json({ url });
});

/** POST /portal — portalul Stripe: card, facturi, schimbarea sau anularea planului */
billingRoutes.post("/portal", requireAdmin, async (c) => {
  const auth = c.get("auth");
  const org = (await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId) }))!;
  return c.json({ url: await createPortal(org) });
});

export const stripeWebhookRoutes = new Hono();

stripeWebhookRoutes.post("/webhook", async (c) => {
  const raw = await c.req.text();
  let event;
  try {
    event = verifyWebhook(raw, c.req.header("stripe-signature"));
  } catch (e) {
    log.warn("webhook Stripe respins", { err: (e as Error).message });
    return c.json({ error: "Semnătură invalidă" }, 400);
  }
  try {
    const r = await handleStripeEvent(event);
    return c.json({ received: true, duplicate: r.duplicate });
  } catch (e) {
    log.error("webhook Stripe eșuat", { type: event.type, id: event.id, err: serializeError(e) });
    return c.json({ error: "Procesare eșuată" }, 500); // Stripe va reîncerca
  }
});
