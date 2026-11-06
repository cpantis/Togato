import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://togato.ro";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/preturi", "/ajutor", "/autoevaluare", "/termeni", "/confidentialitate", "/dpa", "/subimputerniciti"].map((p) => ({ url: `${SITE}${p}`, changeFrequency: "monthly" }));
}
