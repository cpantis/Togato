/**
 * Raportarea erorilor neprevăzute către Sentry (dacă SENTRY_DSN e setat), fără SDK:
 * un eveniment trimis prin endpoint-ul „envelope”. Nu blochează niciodată cererea și
 * nu trimite corpul cererii (poate conține date ale clienților).
 */
import crypto from "crypto";
import { log, logContext, serializeError } from "./logger";

interface Dsn { endpoint: string; key: string }

function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return { endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username };
  } catch {
    return null;
  }
}

export function buildEnvelope(err: unknown, extra: Record<string, unknown>, now = new Date()) {
  const e = serializeError(err);
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: "node",
    level: "error",
    environment: process.env.NODE_ENV || "development",
    release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA,
    exception: { values: [{ type: e.name || "Error", value: e.message, stacktrace: e.stack ? { frames: [] } : undefined }] },
    extra: { ...extra, stack: e.stack },
    tags: { service: "togato-api" },
  };
  return [JSON.stringify({ event_id: eventId, sent_at: now.toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
}

export function reportError(err: unknown, extra: Record<string, unknown> = {}) {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  const body = buildEnvelope(err, { ...logContext.getStore(), ...extra });
  fetch(dsn.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=togato/1.0, sentry_key=${dsn.key}`,
    },
    body,
    signal: AbortSignal.timeout(3000),
  }).catch((e) => log.warn("raportarea erorii a eșuat", { err: serializeError(e) }));
}

export const _parseDsn = parseDsn;
