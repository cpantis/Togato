import { log } from "../lib/logger";
/**
 * Datele firmei după CUI.
 *
 * 1. ANAF (serviciul public, gratuit, fără cheie): denumire, adresă, Nr. Reg. Com., CAEN, TVA, stare.
 * 2. ListaFirme (opțional, LISTAFIRME_API_KEY): completează numărul de angajați și cifra de afaceri.
 */
import type { CompanyLookup } from "@togato/shared";

const ANAF_URL = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";
const LISTAFIRME_URL = "https://listafirme.ro/api/info-v2.asp";
const TIMEOUT_MS = 12_000;

const cache = new Map<string, { at: number; data: CompanyLookup | null }>();
const CACHE_MS = 24 * 3600 * 1000;

export function cleanCui(raw: string): string {
  return raw.replace(/^RO/i, "").replace(/\D/g, "");
}

/** Cifra de control a CUI-ului (algoritmul oficial, cheia 753217532). */
export function isValidCui(raw: string): boolean {
  const cui = cleanCui(raw);
  if (cui.length < 2 || cui.length > 10) return false;
  const key = "753217532";
  const digits = cui.slice(0, -1).padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * Number(key[i]);
  let control = (sum * 10) % 11;
  if (control === 10) control = 0;
  return control === Number(cui[cui.length - 1]);
}

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function lookupAnaf(cui: string): Promise<CompanyLookup | null> {
  const today = new Date().toISOString().slice(0, 10);
  const json = await fetchJson(ANAF_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ cui: Number(cui), data: today }]),
  });
  const found = Array.isArray(json?.found) ? json.found[0] : null;
  if (!found) return null;
  const g = found.date_generale || {};
  const sediu = found.adresa_sediu_social || {};
  const inactiv = found.stare_inactiv?.statusInactivi === true;
  return {
    cui,
    name: str(g.denumire) || `CUI ${cui}`,
    regCom: str(g.nrRegCom),
    address: str(g.adresa),
    city: str(sediu.sdenumire_Localitate),
    county: str(sediu.sdenumire_Judet),
    caen: str(g.cod_CAEN),
    caenDescription: null,
    employees: null,
    turnover: null,
    vatPayer: typeof found.inregistrare_scop_Tva?.scpTVA === "boolean" ? found.inregistrare_scop_Tva.scpTVA : null,
    active: str(g.stare_inregistrare) ? !inactiv && !/radiat/i.test(g.stare_inregistrare) : null,
    source: "anaf",
  };
}

async function enrichListaFirme(base: CompanyLookup | null, cui: string): Promise<CompanyLookup | null> {
  const key = process.env.LISTAFIRME_API_KEY;
  if (!key) return base;
  const data = { TaxCode: cui, Name: "", RegNo: "", NACE: "", NACEDescription: "", County: "", City: "", Address: "", Turnover: "", Employees: "", VAT: "" };
  const body = `key=${encodeURIComponent(key)}&data=${encodeURIComponent(JSON.stringify(data))}`;
  try {
    const raw = await fetchJson(LISTAFIRME_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (raw?.error) return base;
    return {
      cui,
      name: base?.name || str(raw.Name) || `CUI ${cui}`,
      regCom: base?.regCom || str(raw.RegNo),
      address: base?.address || str(raw.Address),
      city: base?.city || str(raw.City),
      county: base?.county || str(raw.County),
      caen: base?.caen || str(raw.NACE),
      caenDescription: str(raw.NACEDescription),
      employees: num(raw.Employees),
      turnover: num(raw.Turnover),
      vatPayer: base?.vatPayer ?? null,
      active: base?.active ?? null,
      source: base ? base.source : "listafirme",
    };
  } catch (e) {
    log.warn("lookup listafirme eșuat", { err: (e as Error).message });
    return base;
  }
}

export async function lookupCompany(rawCui: string): Promise<CompanyLookup | null> {
  const cui = cleanCui(rawCui);
  const hit = cache.get(cui);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  let result: CompanyLookup | null = null;
  try {
    result = await lookupAnaf(cui);
  } catch (e) {
    log.warn("lookup ANAF eșuat", { err: (e as Error).message });
    if (!process.env.LISTAFIRME_API_KEY) throw new Error("Serviciul ANAF nu răspunde momentan. Completează datele manual sau reîncearcă.");
  }
  result = await enrichListaFirme(result, cui);
  cache.set(cui, { at: Date.now(), data: result });
  return result;
}
