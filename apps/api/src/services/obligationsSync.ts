import { and, eq, isNull, inArray, sql } from "drizzle-orm";
import { CLIENT_OBLIGATIONS, type ObligationTemplate } from "@togato/shared";
import type { Tx } from "../db";
import { aiSystems, obligations } from "../db/schema";

/**
 * Sincronizează obligațiile unui sistem cu lista calculată la clasificare.
 * Păstrează starea/notele obligațiilor care rămân aplicabile, adaugă ce e nou,
 * șterge ce nu se mai aplică. Textele se actualizează (catalogul poate evolua).
 */
export async function syncSystemObligations(
  tx: Tx,
  params: { organizationId: string; clientId: string; aiSystemId: string; templates: ObligationTemplate[] },
) {
  const { organizationId, clientId, aiSystemId, templates } = params;
  const existing = await tx.select().from(obligations).where(eq(obligations.aiSystemId, aiSystemId));
  const wanted = new Map(templates.map((t) => [t.code, t]));

  const stale = existing.filter((o) => !wanted.has(o.code)).map((o) => o.id);
  if (stale.length) await tx.delete(obligations).where(inArray(obligations.id, stale));

  for (const o of existing) {
    const t = wanted.get(o.code);
    if (!t) continue;
    await tx.update(obligations).set({
      article: t.article, title: t.title, description: t.description, appliesFrom: t.appliesFrom, recommended: !!t.recommended,
    }).where(eq(obligations.id, o.id));
  }

  const have = new Set(existing.map((o) => o.code));
  const toInsert = templates.filter((t) => !have.has(t.code));
  if (toInsert.length) {
    await tx.insert(obligations).values(toInsert.map((t) => ({
      organizationId, clientId, aiSystemId,
      code: t.code, article: t.article, title: t.title, description: t.description,
      appliesFrom: t.appliesFrom, recommended: !!t.recommended,
    })));
  }
}

/** Obligațiile generale ale clientului există cât timp clientul are cel puțin un sistem AI. */
export async function syncClientObligations(tx: Tx, organizationId: string, clientId: string) {
  const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(aiSystems).where(eq(aiSystems.clientId, clientId));
  const clientLevel = and(eq(obligations.clientId, clientId), isNull(obligations.aiSystemId));

  if (count === 0) {
    await tx.delete(obligations).where(clientLevel);
    return;
  }
  const existing = await tx.select({ code: obligations.code }).from(obligations).where(clientLevel);
  const have = new Set(existing.map((o) => o.code));
  const toInsert = CLIENT_OBLIGATIONS.filter((t) => !have.has(t.code));
  if (toInsert.length) {
    await tx.insert(obligations).values(toInsert.map((t) => ({
      organizationId, clientId, aiSystemId: null,
      code: t.code, article: t.article, title: t.title, description: t.description,
      appliesFrom: t.appliesFrom, recommended: !!t.recommended,
    })));
  }
}
