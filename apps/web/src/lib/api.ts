/**
 * Sesiunea stă într-un cookie httpOnly (inaccesibil scripturilor). Pentru cererile care modifică
 * date, trimitem tokenul CSRF din cookie-ul `togato_csrf` în antetul X-CSRF-Token.
 */
const LEGACY_TOKEN_KEY = "togato-token";
const PUBLIC_PATHS = /^\/($|(login|signup|invite|portal|reset|forgot|autoevaluare|confirmare-email|termeni|confidentialitate|dpa|subimputerniciti|preturi|ajutor)(\/|$))/;

function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)togato_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** curăță tokenul din versiunile vechi (păstrat în localStorage) */
export function clearLegacyToken() {
  try { localStorage.removeItem(LEGACY_TOKEN_KEY); } catch { /* mod privat */ }
}

function onUnauthorized(path: string) {
  if (typeof window === "undefined" || path.startsWith("/api/auth/")) return;
  if (!PUBLIC_PATHS.test(window.location.pathname)) window.location.assign("/login");
}

function authHeaders(method: string): Record<string, string> {
  const h: Record<string, string> = {};
  if (method !== "GET" && method !== "HEAD") {
    const t = csrfToken();
    if (t) h["X-CSRF-Token"] = t;
  }
  return h;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: any = null) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders((init.method || "GET").toUpperCase()), ...(init.headers as Record<string, string>) };
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError("Serverul nu răspunde. Verifică conexiunea și reîncearcă.", 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) onUnauthorized(path);
    const details = Array.isArray(body?.details) ? body.details.map((d: any) => d.message).join(" · ") : "";
    const ref = res.status >= 500 && body?.requestId ? ` (cod pentru suport: ${String(body.requestId).slice(0, 8)})` : "";
    throw new ApiError((details || body?.error || `Eroare ${res.status}`) + ref, res.status, body);
  }
  return body as T;
}

export const apiGet = <T = any>(path: string) => api<T>(path);
export const apiPost = <T = any>(path: string, data?: unknown) => api<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });
export const apiPut = <T = any>(path: string, data: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(data) });
export const apiPatch = <T = any>(path: string, data: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(data) });
export const apiDelete = <T = void>(path: string) => api<T>(path, { method: "DELETE" });

/** Descarcă un fișier de la o rută autentificată și îl salvează cu numele trimis de server. */
export async function apiDownload(path: string, fallbackName = "document.docx"): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin" });
  } catch {
    throw new ApiError("Serverul nu răspunde. Verifică conexiunea și reîncearcă.", 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401) onUnauthorized(path);
    throw new ApiError(body?.error || `Eroare ${res.status}`, res.status, body);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i) || disposition.match(/filename="([^"]+)"/i);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
