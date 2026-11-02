/**
 * Criptare AES-256-GCM pentru secrete păstrate în baza de date (ex. secretul TOTP).
 * Cheia: ENCRYPTION_KEY (64 de caractere hex). Dacă lipsește, se derivă din JWT_SECRET (HKDF),
 * cu avertisment — în producție setați ENCRYPTION_KEY separat.
 */
import crypto from "crypto";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "hex");
    if (k.length !== 32) throw new Error("ENCRYPTION_KEY trebuie să aibă 64 de caractere hex (32 de octeți)");
    cachedKey = k;
  } else {
    if (!process.env.JWT_SECRET) throw new Error("Lipsesc ENCRYPTION_KEY și JWT_SECRET");
    console.warn("[crypto] ENCRYPTION_KEY nu e setat — cheia se derivă din JWT_SECRET");
    cachedKey = Buffer.from(crypto.hkdfSync("sha256", process.env.JWT_SECRET, "togato", "togato-encryption-v1", 32));
  }
  return cachedKey;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Format criptat necunoscut");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** doar pentru teste */
export function _resetKeyCache() {
  cachedKey = null;
}
