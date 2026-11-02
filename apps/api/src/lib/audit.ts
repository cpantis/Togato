import { db, type Tx } from "../db";
import { auditLog } from "../db/schema";
import type { AuthContext } from "../types/hono";

export async function audit(
  auth: AuthContext,
  action: string,
  entity: string,
  entityId: string | null,
  details?: Record<string, unknown>,
  tx?: Tx,
) {
  try {
    await (tx || db).insert(auditLog).values({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action,
      entity,
      entityId,
      details: details ?? null,
    });
  } catch (e) {
    // Jurnalul nu trebuie să blocheze operația principală
    console.warn("[audit]", action, entity, (e as Error).message);
  }
}
