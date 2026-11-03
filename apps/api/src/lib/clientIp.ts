/**
 * IP-ul clientului, fără a ne lăsa păcăliți de un X-Forwarded-For falsificat:
 * TRUST_PROXY_HOPS = câte proxy-uri de încredere sunt în fața API-ului (ex. 2 = marginea Railway + Next.js).
 * Se ia adresa adăugată de cel mai îndepărtat proxy de încredere; ce a scris clientul înainte e ignorat.
 */
import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { config } from "../config";

export function pickForwarded(header: string | undefined, hops: number): string | null {
  if (!header || hops <= 0) return null;
  const list = header.split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return null;
  // fiecare proxy adaugă la final adresa de la care a primit cererea
  return list[Math.max(0, list.length - hops)] ?? null;
}

export function clientIp(c: Context): string {
  const hops = config().TRUST_PROXY_HOPS;
  const fwd = pickForwarded(c.req.header("x-forwarded-for"), hops);
  if (fwd) return fwd;
  try {
    return getConnInfo(c).remote.address ?? "local";
  } catch {
    return "local"; // app.request() în teste nu are socket
  }
}
