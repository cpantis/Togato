/**
 * Jurnal structurat: o linie JSON pe eveniment (stdout), cu nivel, mesaj și câmpuri.
 * Câmpurile sensibile (parole, tokenuri, secrete) sunt mascate înainte de scriere.
 */
import { AsyncLocalStorage } from "async_hooks";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|totp|code$|apiKey/i;

/** contextul cererii curente (request id, cabinet, utilizator) — apare automat în fiecare linie */
export const logContext = new AsyncLocalStorage<Record<string, unknown>>();

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || "info";
  return ORDER[lvl] ?? ORDER.info;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? "[mascat]" : redact(v, depth + 1);
  return out;
}

export function serializeError(e: unknown) {
  if (!(e instanceof Error)) return { message: String(e) };
  return { name: e.name, message: e.message, stack: e.stack?.split("\n").slice(0, 12).join("\n") };
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && !process.env.LOG_IN_TESTS) return;
  if (ORDER[level] < threshold()) return;
  const line = { time: new Date().toISOString(), level, msg, ...logContext.getStore(), ...(redact(fields ?? {}) as object) };
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(JSON.stringify(line) + "\n");
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};
