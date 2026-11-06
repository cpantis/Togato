"use client";
import { useEffect, useRef } from "react";

/** cheia publică Turnstile; fără ea, captcha e dezactivată (API-ul o cere doar dacă are cheia secretă) */
export const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("captcha")); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Verificarea Cloudflare Turnstile (fără cookie-uri de urmărire). Pentru un token nou după o eroare,
 * remontați componenta (schimbați `key`). Nu afișează nimic dacă nu e configurată.
 */
export function Captcha({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!CAPTCHA_SITE_KEY || !ref.current) return;
    let id: string | null = null;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      id = window.turnstile.render(ref.current, {
        sitekey: CAPTCHA_SITE_KEY, language: "ro", appearance: "interaction-only",
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    }).catch(() => onToken(null));
    return () => { cancelled = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!CAPTCHA_SITE_KEY) return null;
  return <div ref={ref} className="min-h-0" />;
}
