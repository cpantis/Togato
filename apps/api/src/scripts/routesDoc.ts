/**
 * Generează docs/api-routes.md din rutele reale ale aplicației.
 *   npm run docs:routes -w @togato/api
 * Testul de integrare `docs.int.test.ts` pică dacă fișierul nu mai corespunde codului.
 */
import fs from "fs";
import path from "path";

const PUBLIC = [/^\/health/, /^\/api\/auth\//, /^\/api\/portal\//, /^\/api\/public\//, /^\/api\/stripe\//];
const GROUPS: [RegExp, string][] = [
  [/^\/health/, "Operațional"], [/^\/api\/auth\//, "Autentificare (public)"], [/^\/api\/portal\//, "Portalul clientului (public, token în URL)"],
  [/^\/api\/public\//, "Fișiere publice"], [/^\/api\/stripe\//, "Stripe (webhook semnat)"], [/^\/api\/account/, "Contul propriu"],
  [/^\/api\/organization/, "Cabinet"], [/^\/api\/team/, "Echipă"], [/^\/api\/billing/, "Abonament"], [/^\/api\/clients/, "Clienți"],
  [/^\/api\/ai-systems/, "Sisteme AI"], [/^\/api\/(obligations|evidence)/, "Obligații și dovezi"], [/^\/api\/snapshots/, "Avize înghețate"],
  [/^\/api\/(dashboard|legislation|law)/, "Panou, legislație, textul legii"], [/^\/api\/platform/, "Consola platformei (echipa Togato)"],
];

export function routesMarkdown(routes: { method: string; path: string }[]): string {
  const seen = new Set<string>();
  const list = routes.filter((r) => r.method !== "ALL" && !r.path.includes("*")).filter((r) => {
    const k = `${r.method} ${r.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const groups = new Map<string, string[]>();
  for (const r of list) {
    const g = GROUPS.find(([re]) => re.test(r.path))?.[1] ?? "Altele";
    const access = PUBLIC.some((re) => re.test(r.path)) ? "public" : "sesiune";
    groups.set(g, [...(groups.get(g) ?? []), `| \`${r.method}\` | \`${r.path}\` | ${access} |`]);
  }
  const out = [
    "# Rutele API",
    "",
    "Generat automat din cod (`npm run docs:routes -w @togato/api`) — nu editați de mână.",
    "Autentificare: cookie `togato_session` + antet `X-CSRF-Token` pentru modificări (browser) sau `Authorization: Bearer <token>` (clienți API).",
    "Erori: JSON `{ error, code? }`; 401 sesiune, 402 abonament / limită, 403 rol / politică, 404 inexistent sau din alt cabinet, 429 prea multe cereri.",
    "",
  ];
  for (const [, title] of GROUPS) {
    const rows = groups.get(title);
    if (!rows) continue;
    out.push(`## ${title}`, "", "| Metodă | Rută | Acces |", "|---|---|---|", ...rows, "");
  }
  if (groups.get("Altele")) out.push("## Altele", "", "| Metodă | Rută | Acces |", "|---|---|---|", ...groups.get("Altele")!, "");
  return out.join("\n");
}

export const ROUTES_DOC = path.resolve(__dirname, "../../../../docs/api-routes.md");

if (require.main === module) {
  import("../app").then(({ app }) => {
    fs.writeFileSync(ROUTES_DOC, routesMarkdown(app.routes));
    console.log(`scris: ${ROUTES_DOC}`);
    process.exit(0);
  });
}
