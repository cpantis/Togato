/**
 * Cloudflare Turnstile pe formularele publice (înregistrare, autoevaluare, recuperarea linkurilor).
 * Opțional: fără TURNSTILE_SECRET_KEY nu se verifică. Tokenul se verifică server-side, o singură dată.
 */
import { config } from "../config";
import { log } from "../lib/logger";
import { httpError } from "../lib/http";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const captchaEnabled = () => !!config().TURNSTILE_SECRET_KEY;

export async function assertCaptcha(token: string | null | undefined, ip: string | null, action: string) {
  const secret = config().TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token) httpError(400, "Confirmați că nu sunteți un robot (verificarea de securitate).", "captcha_required");
  let ok = false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    ok = !!data.success;
    if (!ok) log.info("captcha respins", { action, codes: data["error-codes"] });
  } catch (e) {
    // serviciul Cloudflare indisponibil: refuzăm (formularul se poate retrimite)
    log.warn("verificarea captcha a eșuat", { action, err: (e as Error).message });
  }
  if (!ok) httpError(400, "Verificarea de securitate nu a reușit. Reîncărcați pagina și încercați din nou.", "captcha_failed");
}
