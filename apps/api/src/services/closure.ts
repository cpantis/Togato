/**
 * Închiderea contului de cabinet și politica de păstrare a dosarelor arhivate.
 * Rulează în worker, pe conexiunea de serviciu (fără RLS) și filtrează explicit pe cabinet.
 */
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "../db";
import { auditLog, clients, evidence, organizations, users } from "../db/schema";
import { frontendBaseUrl } from "../config";
import { enqueue } from "../jobs/queue";
import { log } from "../lib/logger";
import { sendEmail, templates } from "./email";

/** zilele dintre cererea de închidere și ștergerea definitivă (timp pentru export sau răzgândire) */
export const CLOSURE_GRACE_DAYS = 30;
/** cu câte zile înainte de ștergerea unui dosar arhivat sunt anunțați administratorii */
export const RETENTION_WARNING_DAYS = 30;
export const RETENTION_YEARS = [1, 2, 3, 5, 10] as const;

const DAY = 86400_000;

/** data la care un dosar arhivat e șters după politica de păstrare */
export function retentionDeleteOn(archivedAt: Date, years: number): Date {
  const d = new Date(archivedAt);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

const activeAdmins = (organizationId: string) =>
  db.query.users.findMany({ where: and(eq(users.organizationId, organizationId), eq(users.role, "admin"), eq(users.status, "activ")) });

/** șterge definitiv cabinetele cu închiderea ajunsă la termen (CASCADE pe toate datele; fișierele printr-un job) */
export async function purgeClosedOrganizations(now = new Date()) {
  const due = await db.select().from(organizations).where(and(isNotNull(organizations.closureScheduledFor), lte(organizations.closureScheduledFor, now)));
  for (const o of due) {
    const admins = await activeAdmins(o.id);
    const files = await db.select({ key: evidence.storageKey }).from(evidence).where(eq(evidence.organizationId, o.id));
    const keys = [...files.map((f) => f.key), ...(o.logoKey ? [o.logoKey] : [])];
    await db.transaction(async (tx) => {
      // joburile fără cabinet: altfel ar fi șterse împreună cu el
      if (keys.length) await enqueue("storage.delete", { keys }, { tx });
      for (const a of admins) await sendEmail(templates.closureCompleted({ to: a.email, name: a.name, orgName: o.name }), { tx });
      await tx.delete(organizations).where(and(eq(organizations.id, o.id), isNotNull(organizations.closureScheduledFor), lte(organizations.closureScheduledFor, now)));
    });
    log.info("cabinet închis și șters", { organizationId: o.id, files: keys.length, requestedAt: o.closureRequestedAt?.toISOString() });
  }
  return due.length;
}

/** politica de păstrare: anunță cu 30 de zile înainte, apoi șterge dosarele arhivate expirate */
export async function applyRetention(now = new Date()) {
  const orgs = await db.select().from(organizations).where(and(isNotNull(organizations.archivedRetentionYears), isNull(organizations.closureScheduledFor)));
  let deleted = 0;
  for (const o of orgs) {
    const years = o.archivedRetentionYears!;
    const archived = await db.select().from(clients).where(and(eq(clients.organizationId, o.id), isNotNull(clients.archivedAt)));
    const expired = archived.filter((c) => retentionDeleteOn(c.archivedAt!, years) <= now);
    // ștergem doar dosarele anunțate de cel puțin RETENTION_WARNING_DAYS (politica schimbată ulterior nu șterge pe nepregătite)
    const toDelete = expired.filter((c) => c.retentionWarnedAt && now.getTime() - c.retentionWarnedAt.getTime() >= RETENTION_WARNING_DAYS * DAY);
    const toWarn = archived.filter((c) => !c.retentionWarnedAt && retentionDeleteOn(c.archivedAt!, years).getTime() - now.getTime() <= RETENTION_WARNING_DAYS * DAY);

    if (toWarn.length) {
      const admins = await activeAdmins(o.id);
      const items = toWarn.map((c) => ({ name: c.name, deleteOn: new Date(Math.max(retentionDeleteOn(c.archivedAt!, years).getTime(), now.getTime() + RETENTION_WARNING_DAYS * DAY)) }));
      await db.transaction(async (tx) => {
        await tx.update(clients).set({ retentionWarnedAt: now }).where(and(eq(clients.organizationId, o.id), inArray(clients.id, toWarn.map((c) => c.id))));
        for (const a of admins) await sendEmail(templates.retentionWarning({ to: a.email, name: a.name, orgName: o.name, items, url: `${frontendBaseUrl()}/settings#pastrare` }), { tx, organizationId: o.id });
      });
    }

    for (const c of toDelete) {
      const files = await db.select({ key: evidence.storageKey }).from(evidence).where(and(eq(evidence.clientId, c.id), eq(evidence.organizationId, o.id)));
      await db.transaction(async (tx) => {
        await tx.delete(clients).where(and(eq(clients.id, c.id), eq(clients.organizationId, o.id), isNotNull(clients.archivedAt)));
        if (files.length) await enqueue("storage.delete", { keys: files.map((f) => f.key) }, { tx, organizationId: o.id });
        await tx.insert(auditLog).values({ organizationId: o.id, userId: null, action: "retention_delete", entity: "client", entityId: c.id, details: { name: c.name, cui: c.cui, archivedAt: c.archivedAt!.toISOString(), years, files: files.length } });
      });
      deleted++;
    }
  }
  return deleted;
}
