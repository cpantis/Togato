import { describe, expect, it } from "vitest";
import { redact, serializeError } from "./logger";
import { _parseDsn, buildEnvelope } from "./errorReporting";

describe("jurnal", () => {
  it("maschează câmpurile sensibile, inclusiv în obiecte imbricate", () => {
    const out = redact({ email: "a@b.ro", password: "x", nested: { token: "t", ok: 1 }, list: [{ secret: "s" }] }) as any;
    expect(out).toEqual({ email: "a@b.ro", password: "[mascat]", nested: { token: "[mascat]", ok: 1 }, list: [{ secret: "[mascat]" }] });
  });
  it("serializează erorile", () => {
    expect(serializeError(new TypeError("rău"))).toMatchObject({ name: "TypeError", message: "rău" });
    expect(serializeError("text")).toEqual({ message: "text" });
  });
});

describe("raportarea erorilor", () => {
  it("interpretează DSN-ul Sentry", () => {
    expect(_parseDsn("https://abc123@o1.ingest.sentry.io/42")).toEqual({ endpoint: "https://o1.ingest.sentry.io/api/42/envelope/", key: "abc123" });
    expect(_parseDsn(undefined)).toBeNull();
    expect(_parseDsn("nu-e-url")).toBeNull();
  });
  it("construiește un envelope cu trei linii JSON", () => {
    const lines = buildEnvelope(new Error("boom"), { path: "/api/x" }).split("\n");
    expect(lines).toHaveLength(3);
    const event = JSON.parse(lines[2]);
    expect(event.exception.values[0].value).toBe("boom");
    expect(event.extra.path).toBe("/api/x");
  });
});
