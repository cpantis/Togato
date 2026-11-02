import { Hono } from "hono";
import type { LegislationData } from "@togato/shared";
import { RULESET_CHANGELOG, RULESET_VERSION } from "@togato/shared";
import type { AppEnv } from "../types/hono";
import { pendingLawUpdates } from "../services/reclassify";

export const legislationRoutes = new Hono<AppEnv>();

/** GET / — istoricul versiunilor regulilor + sistemele cabinetului reîncadrate, încă neverificate */
legislationRoutes.get("/", async (c) => {
  const rows = await pendingLawUpdates(c.get("auth").organizationId);
  const data: LegislationData = {
    current: RULESET_VERSION,
    changelog: RULESET_CHANGELOG,
    affected: rows.map((r) => ({
      id: r.id, name: r.name, clientId: r.client.id, clientName: r.client.name, note: r.reclassNote ?? "",
      reclassifiedAt: r.reclassifiedAt?.toISOString() ?? null, riskLevel: r.riskLevel,
    })),
  };
  return c.json(data);
});
