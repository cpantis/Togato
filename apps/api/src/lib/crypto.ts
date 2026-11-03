/**
 * Criptare AES-256-GCM pentru secrete păstrate în baza de date (ex. secretul TOTP).
 * Cheia: ENCRYPTION_KEY (64 de caractere hex). Dacă lipsește (doar în dezvoltare), se derivă din
 * JWT_SECRET (HKDF), cu avertisment.
 *
 * Rotirea cheii: puneți cheia veche în ENCRYPTION_KEY_PREVIOUS și una nouă în ENCRYPTION_KEY.
 * Datele se citesc cu oricare dintre ele (GCM verifică autenticitatea, deci cheia greșită e respinsă),
 * iar `npm run reencrypt -w @togato/api` le rescrie cu cheia nouă; apoi ENCRYPTION_KEY_PREVIOUS se șterge.
 */
import crypto from "crypto";
import { log } from "./logger";

let cached: { current: Buffer; previous: Buffer | null } | null = null;

function parseKey(raw: string, name: string): Buffer {
  const k = Buffer.from(raw, "hex");
  if (k.length !== 32 || !/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error(`${name} trebuie să aibă 64 de caractere hex (32 de octeți)`);
  return k;
}

function keys() {
  if (cached) return cached;
  const raw = process.env.ENCRYPTION_KEY;
  let current: Buffer;
  if (raw) {
    current = parseKey(raw, "ENCRYPTION_KEY");
  } else {
    if (!process.env.JWT_SECRET) throw new Error("Lipsesc ENCRYPTION_KEY și JWT_SECRET");
    log.warn("ENCRYPTION_KEY nu e setat — cheia se derivă din JWT_SECRET");
    current = Buffer.from(crypto.hkdfSync("sha256", process.env.JWT_SECRET, "togato", "togato-encryption-v1", 32));
  }
  const prevRaw = process.env.ENCRYPTION_KEY_PREVIOUS;
  cached = { current, previous: prevRaw ? parseKey(prevRaw, "ENCRYPTION_KEY_PREVIOUS") : null };
  return cached;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keys().current, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

function decryptWith(key: Buffer, iv: string, tag: string, data: string): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** decriptează și spune cu ce cheie a reușit („previous” = trebuie recriptat) */
export function decryptDetailed(payload: string): { plain: string; key: "current" | "previous" } {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Format criptat necunoscut");
  const k = keys();
  try {
    return { plain: decryptWith(k.current, iv, tag, data), key: "current" };
  } catch (e) {
    if (!k.previous) throw e;
    return { plain: decryptWith(k.previous, iv, tag, data), key: "previous" };
  }
}

export function decrypt(payload: string): string {
  return decryptDetailed(payload).plain;
}

/** doar pentru teste */
export function _resetKeyCache() {
  cached = null;
}
