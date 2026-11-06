import Script from "next/script";

/**
 * Analitică fără cookie-uri (Plausible), doar pe paginile publice de prezentare — niciodată în aplicație
 * sau în portalul clientului. Activă doar dacă NEXT_PUBLIC_PLAUSIBLE_DOMAIN e setat la build.
 */
export const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || "";
export const PLAUSIBLE_SRC = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.js";

export function Analytics() {
  if (!PLAUSIBLE_DOMAIN) return null;
  return <Script defer data-domain={PLAUSIBLE_DOMAIN} src={PLAUSIBLE_SRC} strategy="afterInteractive" />;
}
