/**
 * Politica de securitate a conținutului, cu nonce per cerere (setată în middleware).
 * Scripturile fără nonce sunt blocate; 'strict-dynamic' permite scripturile încărcate de cele de încredere
 * (ex. Turnstile). 'unsafe-inline' e ignorat de browserele care înțeleg nonce (rămâne pentru cele foarte vechi).
 */
export function buildCsp(nonce: string, opts: { dev?: boolean } = {}): string {
  const plausible = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ? new URL(process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.js").origin : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https://challenges.cloudflare.com${plausible ? ` ${plausible}` : ""}${opts.dev ? " 'unsafe-eval'" : ""}`,
    "frame-src https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // logo-ul cabinetului poate fi un URL extern (https); codul QR pentru 2FA e data:
    "img-src 'self' data: blob: https:",
    `connect-src 'self'${plausible ? ` ${plausible}` : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
