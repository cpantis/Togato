import { HTTPException } from "hono/http-exception";

export function notFound(message = "Resursa nu a fost găsită"): never {
  throw new HTTPException(404, { res: Response.json({ error: message }, { status: 404 }) });
}

export function badRequest(message: string): never {
  throw new HTTPException(400, { res: Response.json({ error: message }, { status: 400 }) });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un id din URL care nu e UUID ar produce o eroare Postgres (500) — îl tratăm ca 404. */
export function uuidParam(value: string | undefined): string {
  if (!value || !UUID_RE.test(value)) notFound();
  return value;
}

/** eroare cu cod și mesaj pentru utilizator (ex. 422 fișier respins, 503 serviciu indisponibil) */
export function httpError(status: 400 | 403 | 422 | 503, message: string, code: string): never {
  throw new HTTPException(status, { res: Response.json({ error: message, code }, { status }) });
}
