import { describe, expect, it } from "vitest";
import { billingState, effectiveLimits, planDef } from "./plans";

const now = new Date("2026-11-03T10:00:00Z");
const future = new Date("2026-11-10T00:00:00Z");
const past = new Date("2026-11-01T00:00:00Z");

describe("starea de facturare", () => {
  it("proba până la sfârșitul perioadei, apoi expirat", () => {
    expect(billingState({ status: "trial", trialEndsAt: future, subscriptionStatus: null }, now)).toBe("proba");
    expect(billingState({ status: "trial", trialEndsAt: past, subscriptionStatus: null }, now)).toBe("expirat");
  });
  it("abonamentul Stripe are prioritate față de probă", () => {
    expect(billingState({ status: "trial", trialEndsAt: past, subscriptionStatus: "active" }, now)).toBe("activ");
    expect(billingState({ status: "activ", trialEndsAt: null, subscriptionStatus: "past_due" }, now)).toBe("restant");
    expect(billingState({ status: "activ", trialEndsAt: null, subscriptionStatus: "canceled" }, now)).toBe("expirat");
  });
  it("activ fără Stripe = acordat manual; suspendarea bate orice", () => {
    expect(billingState({ status: "activ", trialEndsAt: null, subscriptionStatus: null }, now)).toBe("activ");
    expect(billingState({ status: "suspendat", trialEndsAt: future, subscriptionStatus: "active" }, now)).toBe("suspendat");
  });
  it("limitele: de probă în probă, ale planului altfel; enterprise nelimitat", () => {
    expect(effectiveLimits("proba", "cabinet")).toEqual({ maxClients: 10, maxUsers: 5 });
    expect(effectiveLimits("activ", "cabinet")).toEqual({ maxClients: 75, maxUsers: 20 });
    expect(effectiveLimits("activ", "enterprise")).toEqual({ maxClients: null, maxUsers: null });
    expect(planDef("necunoscut").code).toBe("start");
  });
});
