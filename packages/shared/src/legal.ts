/**
 * Documentele juridice ale Togato față de cabinete. La o versiune nouă, administratorul fiecărui
 * cabinet trebuie să o accepte (până atunci, modificările sunt blocate). Textele sunt în
 * apps/web/src/content/legal/ — PROIECTE, de revizuit de avocat înainte de lansare.
 */
export const LEGAL_VERSION = "2026-11-06";

export const LEGAL_DOCUMENTS = [
  { code: "termeni", path: "/termeni", title: "Termeni și condiții" },
  { code: "confidentialitate", path: "/confidentialitate", title: "Politica de confidențialitate" },
  { code: "dpa", path: "/dpa", title: "Acordul de prelucrare a datelor (Art. 28 GDPR)" },
  { code: "subimputerniciti", path: "/subimputerniciti", title: "Lista persoanelor împuternicite secundare" },
] as const;
