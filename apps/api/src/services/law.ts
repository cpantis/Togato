/**
 * Textul oficial al AI Act (RO), importat cu scripts/import_ai_act.py în src/legal/ai_act_ro.json.
 * Rezolvă trimiterile din catalog („Art. 26(7)”, „Anexa III pct. 4(a)”) la textul exact.
 */
import fs from "fs";
import path from "path";
import { parseLawRefs, type LawRef } from "@togato/shared";

interface Paragraph { n: string | null; lines: string[] }
interface Article { heading: string; title: string; paragraphs: Paragraph[] }
interface AnnexItem { n: string | null; section: string | null; lines: string[]; points: { letter: string; lines: string[] }[] }
interface Annex { heading: string; title: string; intro: string[]; items: AnnexItem[] }
export interface LawData {
  source: { act: string; celex: string; language: string; version: string; journal: string; url: string; note: string; importedAt: string };
  articles: Record<string, Article>;
  annexes: Record<string, Annex>;
}

let cache: LawData | null = null;

export function loadLaw(): LawData {
  if (cache) return cache;
  // src/services (tsx) sau dist/services (build) → fișierul stă în src/legal
  const candidates = [path.resolve(__dirname, "../legal/ai_act_ro.json"), path.resolve(__dirname, "../../src/legal/ai_act_ro.json")];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error("Textul AI Act nu a fost găsit (src/legal/ai_act_ro.json)");
  cache = JSON.parse(fs.readFileSync(file, "utf-8")) as LawData;
  return cache;
}

export interface ResolvedRef {
  label: string;
  found: boolean;
  /** „Articolul 26 — Obligațiile implementatorilor ...” */
  heading: string;
  /** „alin. (7)”, „pct. 4” — partea afișată */
  part: string | null;
  lines: string[];
  /** litera de evidențiat în text, ex. „f” */
  focus: string | null;
  url: string;
  external: boolean;
}

export function resolveRef(ref: LawRef, law = loadLaw()): ResolvedRef {
  const base = law.source.url;
  if (ref.kind === "external") {
    return { label: ref.label, found: true, heading: ref.label, part: null, lines: [], focus: null, url: ref.url ?? base, external: true };
  }
  if (ref.kind === "article") {
    const a = law.articles[ref.article];
    const url = `${base}#art_${ref.article}`;
    if (!a) return { label: ref.label, found: false, heading: `Articolul ${ref.article}`, part: null, lines: [], focus: null, url, external: false };
    const heading = `${a.heading} — ${a.title}`;
    if (ref.paragraph) {
      const p = a.paragraphs.find((x) => x.n === ref.paragraph);
      if (!p) return { label: ref.label, found: false, heading, part: `alin. (${ref.paragraph})`, lines: [], focus: null, url, external: false };
      const hasPoint = !ref.point || p.lines.some((l) => l.trim().startsWith(`(${ref.point})`));
      const part = /^\d+\.\s/.test(p.lines[0] ?? "") ? `pct. ${ref.paragraph}` : `alin. (${ref.paragraph})`;
      return { label: ref.label, found: hasPoint, heading, part, lines: p.lines, focus: ref.point ?? null, url, external: false };
    }
    return { label: ref.label, found: true, heading, part: null, lines: a.paragraphs.flatMap((p) => p.lines), focus: null, url, external: false };
  }
  const x = law.annexes[ref.annex];
  if (!x) return { label: ref.label, found: false, heading: `Anexa ${ref.annex}`, part: null, lines: [], focus: null, url: base, external: false };
  const heading = `${x.heading} — ${x.title}`;
  if (ref.item) {
    const it = x.items.find((i) => i.n === ref.item);
    if (!it) return { label: ref.label, found: false, heading, part: `pct. ${ref.item}`, lines: [], focus: null, url: base, external: false };
    const hasPoint = !ref.point || it.points.some((p) => p.letter === ref.point);
    return { label: ref.label, found: hasPoint, heading, part: `pct. ${ref.item}`, lines: it.lines, focus: ref.point ?? null, url: base, external: false };
  }
  return { label: ref.label, found: true, heading, part: null, lines: [...x.intro, ...x.items.flatMap((i) => [`${i.n ? `${i.n}. ` : ""}${i.lines[0] ?? ""}`, ...i.lines.slice(1)])], focus: null, url: base, external: false };
}

export function lookup(text: string) {
  const law = loadLaw();
  return { source: law.source, results: parseLawRefs(text).map((r) => resolveRef(r, law)) };
}
