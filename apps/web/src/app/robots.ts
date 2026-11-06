import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://togato.ro";

/** doar paginile publice se indexează; aplicația, portalul și linkurile cu token nu */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/preturi", "/ajutor", "/autoevaluare", "/termeni", "/confidentialitate", "/dpa", "/subimputerniciti"], disallow: ["/api/", "/portal/", "/invite/", "/reset/", "/confirmare-email/", "/autoevaluare/", "/dashboard", "/clients", "/settings", "/team", "/platform"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
