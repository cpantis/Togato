/**
 * Planurile de abonament și starea de facturare a cabinetului. Prețurile afișate sunt orientative —
 * suma facturată vine din prețul configurat în Stripe (STRIPE_PRICE_*).
 */
export type PlanCode = "start" | "cabinet" | "enterprise";

export interface PlanDef {
  code: PlanCode;
  name: string;
  /** EUR / lună, fără TVA; null = la cerere */
  priceEur: number | null;
  maxClients: number | null;
  maxUsers: number | null;
  features: string[];
  /** se poate cumpăra online (are preț în Stripe) */
  selfServe: boolean;
}

export const PLANS: PlanDef[] = [
  {
    code: "start", name: "Start", priceEur: 149, maxClients: 15, maxUsers: 5, selfServe: true,
    features: ["Până la 15 clienți activi", "5 utilizatori", "Portalul clientului", "Documente Word și avize PDF", "Memoriu AI (cu acordul cabinetului)"],
  },
  {
    code: "cabinet", name: "Cabinet", priceEur: 399, maxClients: 75, maxUsers: 20, selfServe: true,
    features: ["Până la 75 de clienți activi", "20 de utilizatori", "Tot din Start", "Portal cu identitatea cabinetului", "Suport prioritar"],
  },
  {
    code: "enterprise", name: "Enterprise", priceEur: null, maxClients: null, maxUsers: null, selfServe: false,
    features: ["Clienți și utilizatori nelimitați", "Contract și DPA personalizate", "Facturare anuală", "Asistență la implementare"],
  },
];

/** limitele din perioada de probă */
export const TRIAL_LIMITS = { maxClients: 10, maxUsers: 5 } as const;
export const TRIAL_DAYS = 14;

export function planDef(code: string | null | undefined): PlanDef {
  return PLANS.find((p) => p.code === code) ?? PLANS[0];
}

/**
 * proba = în perioada de probă · activ = abonament plătit · restant = plata a eșuat (acces păstrat, Stripe reîncearcă)
 * expirat = probă terminată / abonament anulat → doar citire și export · suspendat = oprit de platformă
 */
export type BillingState = "proba" | "activ" | "restant" | "expirat" | "suspendat";

export interface BillingInput {
  status: "trial" | "activ" | "suspendat";
  trialEndsAt: Date | string | null;
  subscriptionStatus: string | null;
}

export function billingState(org: BillingInput, now = new Date()): BillingState {
  if (org.status === "suspendat") return "suspendat";
  if (org.subscriptionStatus === "active" || org.subscriptionStatus === "trialing") return "activ";
  if (org.subscriptionStatus === "past_due") return "restant";
  // abonamente acordate manual (ex. Enterprise, facturat separat)
  if (org.status === "activ" && !org.subscriptionStatus) return "activ";
  const end = org.trialEndsAt ? new Date(org.trialEndsAt) : null;
  if (org.status === "trial" && end && end > now) return "proba";
  return "expirat";
}

/** limitele efective: în probă cele de probă, altfel cele ale planului */
export function effectiveLimits(state: BillingState, plan: string | null | undefined): { maxClients: number | null; maxUsers: number | null } {
  if (state === "proba") return { ...TRIAL_LIMITS };
  const p = planDef(plan);
  return { maxClients: p.maxClients, maxUsers: p.maxUsers };
}

export const BILLING_STATE_LABELS: Record<BillingState, string> = {
  proba: "Perioadă de probă",
  activ: "Abonament activ",
  restant: "Plată restantă",
  expirat: "Abonament expirat",
  suspendat: "Cont suspendat",
};
