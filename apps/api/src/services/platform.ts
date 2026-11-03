/** Administratorii platformei (echipa Togato): identificare și jurnalul acțiunilor lor. */
import type { Context } from "hono";
import { rootDb } from "../db";
import { auditLog, platformAuditLog } from "../db/schema";
import { config } from "../config";
import { clientIp } from "../lib/clientIp";
import { log } from "../lib/logger";

export function platformAdminEmails(): Set<string> {
  return new Set(config().PLATFORM_ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function isPlatformAdmin(email: string): boolean {
  return platformAdminEmails().has(email.toLowerCase());
}

/**
 * Înregistrează acțiunea în jurnalul platformei și, dacă privește un cabinet, și în jurnalul
 * cabinetului (cabinetul vede când și ce a făcut echipa Togato).
 */
export async function platformAudit(c: Context, actor: { userId: string; email: string }, action: string, targetOrganizationId: string | null, details?: Record<string, unknown>) {
  await rootDb.insert(platformAuditLog).values({ actorUserId: actor.userId, actorEmail: actor.email, action, targetOrganizationId, details: details ?? null, ip: clientIp(c) });
  if (targetOrganizationId) {
    await rootDb.insert(auditLog).values({ organizationId: targetOrganizationId, userId: null, action: `togato_${action}`, entity: "platform", entityId: null, details: { by: actor.email, ...(details ?? {}) } });
  }
  log.info("acțiune platformă", { action, targetOrganizationId, actor: actor.email });
}
