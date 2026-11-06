/**
 * Scanarea antivirus a fișierelor încărcate, prin clamd (protocolul INSTREAM, TCP).
 * Opțională: fără CLAMAV_HOST nu se scanează. Cu clamd indisponibil, implicit refuzăm fișierul.
 */
import net from "net";
import { config } from "../config";
import { log } from "../lib/logger";
import { HTTPException } from "hono/http-exception";
import { httpError } from "../lib/http";

export type ScanResult = { status: "clean" } | { status: "infected"; signature: string } | { status: "skipped" };

const CHUNK = 64 * 1024;
const TIMEOUT_MS = 20_000;

/** trimite fișierul la clamd și interpretează răspunsul („stream: OK” / „stream: <semnătură> FOUND”) */
export function clamdScan(buf: Buffer, host: string, port: number): Promise<{ clean: true } | { clean: false; signature: string }> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    let reply = "";
    const fail = (e: Error) => { sock.destroy(); reject(e); };
    sock.setTimeout(TIMEOUT_MS, () => fail(new Error("clamd: timeout")));
    sock.on("error", fail);
    sock.on("data", (d) => { reply += d.toString("utf8"); });
    sock.on("end", () => {
      const text = reply.replace(/\0/g, "").trim();
      if (/:\s*OK$/.test(text)) return resolve({ clean: true });
      const m = text.match(/:\s*(.+)\s+FOUND$/);
      if (m) return resolve({ clean: false, signature: m[1] });
      reject(new Error(`clamd: răspuns neașteptat (${text.slice(0, 120)})`));
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      for (let i = 0; i < buf.length; i += CHUNK) {
        const part = buf.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        sock.write(len);
        sock.write(part);
      }
      sock.write(Buffer.alloc(4)); // lungime 0 = sfârșitul fluxului
    });
  });
}

/** scanează fișierul; aruncă 422 pentru un fișier infectat și 503 dacă scanarea nu se poate face (fail-closed) */
export async function assertClean(buf: Buffer, context: Record<string, unknown> = {}): Promise<ScanResult> {
  const cfg = config();
  if (!cfg.CLAMAV_HOST) return { status: "skipped" };
  try {
    const r = await clamdScan(buf, cfg.CLAMAV_HOST, cfg.CLAMAV_PORT);
    if (r.clean) return { status: "clean" };
    log.warn("fișier infectat respins", { ...context, signature: r.signature });
    httpError(422, "Fișierul a fost respins de scanarea antivirus.", "infected");
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    log.error("scanarea antivirus a eșuat", { ...context, err: (e as Error).message });
    if (cfg.CLAMAV_FAIL_OPEN) return { status: "skipped" };
    httpError(503, "Scanarea antivirus nu este disponibilă momentan. Încercați din nou peste câteva minute.", "scan_unavailable");
  }
}
