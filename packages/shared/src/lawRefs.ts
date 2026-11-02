/**
 * Trimiterile la lege din catalog („Art. 26(7)”, „Anexa III pct. 4(a)”, „Art. 26(9) + GDPR Art. 35”)
 * transformate în referințe structurate, ca să poată fi legate de textul oficial.
 */

export type LawRef =
  | { kind: "article"; article: string; paragraph?: string; point?: string; label: string }
  | { kind: "annex"; annex: string; item?: string; point?: string; label: string }
  | { kind: "external"; label: string; url?: string };

const GDPR_URL = "https://eur-lex.europa.eu/legal-content/RO/TXT/HTML/?uri=CELEX:32016R0679";

/** Întoarce trimiterile găsite; un text fără trimiteri („Bună practică”, „—”) dă o listă goală. */
export function parseLawRefs(text: string | null | undefined): LawRef[] {
  if (!text) return [];
  const refs: LawRef[] = [];
  for (const raw of text.split("+")) {
    const seg = raw.trim();
    if (!seg) continue;
    if (/GDPR/i.test(seg)) {
      refs.push({ kind: "external", label: seg, url: GDPR_URL });
      continue;
    }
    const annex = seg.match(/^Anexa\s+([IVXLC]+)(?:\s+pct\.\s*(\d+))?(?:\s*(?:\(([a-z]{1,2})\)|lit\.\s*\(([a-z]{1,2})\)))?/i);
    if (annex) {
      refs.push({ kind: "annex", annex: annex[1].toUpperCase(), item: annex[2], point: annex[3] ?? annex[4], label: seg });
      continue;
    }
    const art = seg.match(/^Art(?:\.|icolul)?\s*(\d+)(?:\s*(?:\((\d+)\)|alin\.\s*\((\d+)\)|pct\.\s*(\d+)))?(?:\s*(?:\(([a-z]{1,2})\)|lit\.\s*\(([a-z]{1,2})\)))?/i);
    if (art) {
      refs.push({ kind: "article", article: art[1], paragraph: art[2] ?? art[3] ?? art[4], point: art[5] ?? art[6], label: seg });
    }
  }
  return refs;
}

/** Are textul cel puțin o trimitere la AI Act care poate fi deschisă? */
export function hasLawRef(text: string | null | undefined): boolean {
  return parseLawRefs(text).some((r) => r.kind !== "external");
}
