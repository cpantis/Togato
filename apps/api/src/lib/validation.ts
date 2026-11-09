import { z } from "zod";

/** data calendaristică AAAA-LL-ZZ, existentă (refuză 2026-02-30); altfel Postgres ar da eroare 500 */
export const isoDay = (message = "Data trebuie să fie în formatul AAAA-LL-ZZ") =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message).refine((v) => {
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && y <= 2200 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "Data nu există în calendar.");

/**
 * Caracterul NUL nu poate fi stocat în Postgres (text) — îl refuzăm înainte de a ajunge la baza de date.
 * În JSON apare ca secvența „\u0000” (escapată) sau, rar, ca octet brut. O bară dublă („\\u0000”) e text obișnuit.
 */
export function hasNul(rawJson: string): boolean {
  if (rawJson.includes("\u0000")) return true;
  return /(^|[^\\])(\\\\)*\\u0000/i.test(rawJson);
}
