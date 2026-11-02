const TOKEN_KEY = "togato-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* mod privat */ }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* mod privat */ }
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: any = null) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError("Serverul nu răspunde. Verifică conexiunea și reîncearcă.", 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/api/auth/")) {
      clearToken();
      window.location.assign("/login");
    }
    const details = Array.isArray(body?.details) ? body.details.map((d: any) => d.message).join(" · ") : "";
    throw new ApiError(details || body?.error || `Eroare ${res.status}`, res.status, body);
  }
  return body as T;
}

export const apiGet = <T = any>(path: string) => api<T>(path);
export const apiPost = <T = any>(path: string, data?: unknown) => api<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });
export const apiPut = <T = any>(path: string, data: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(data) });
export const apiPatch = <T = any>(path: string, data: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(data) });
export const apiDelete = (path: string) => api<void>(path, { method: "DELETE" });

/** Descarcă un fișier de la o rută autentificată (un simplu <a href> nu poate trimite tokenul). */
export async function apiDownload(path: string, fallbackName = "document.docx"): Promise<void> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError("Serverul nu răspunde. Verifică conexiunea și reîncearcă.", 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401 && token) {
      clearToken();
      window.location.assign("/login");
    }
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
