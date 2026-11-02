"use client";
import { useEffect, useState } from "react";
import { parseLawRefs } from "@togato/shared";
import { apiGet } from "@/lib/api";
import { Alert, Modal, Spinner, cn } from "@/components/ui";

interface Resolved {
  label: string;
  found: boolean;
  heading: string;
  part: string | null;
  lines: string[];
  focus: string | null;
  url: string;
  external: boolean;
}
interface LawResponse {
  source: { act: string; version: string; journal: string; url: string; note: string; importedAt: string };
  results: Resolved[];
}

const cache = new Map<string, LawResponse>();

function LawText({ r }: { r: Resolved }) {
  if (r.external) {
    return <p className="text-[13px] text-slate-600">Trimitere la alt act normativ. <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">Deschide pe EUR-Lex ↗</a></p>;
  }
  if (!r.found) return <Alert kind="warning">Trimiterea „{r.label}” nu a fost găsită în textul importat. Semnalați-o echipei Togato.</Alert>;
  return (
    <div>
      <div className="text-[14px] font-semibold text-ink">{r.heading}</div>
      {r.part && <div className="text-[12px] text-slate-500">{r.part}{r.focus && `, lit. (${r.focus})`}</div>}
      <div className="mt-3 space-y-1.5">
        {r.lines.map((line, i) => {
          const depth = (line.match(/^ */)?.[0].length ?? 0) / 2;
          const text = line.trim();
          const focused = !!r.focus && text.startsWith(`(${r.focus})`);
          return (
            <p key={i} data-focus={focused || undefined} className={cn("text-[13px] leading-relaxed text-slate-700", focused && "scroll-mt-4 rounded-md bg-amber-50 px-2 py-1 ring-1 ring-amber-200")} style={{ marginLeft: depth * 18 }}>
              {text}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function LawModal({ text, onClose }: { text: string; onClose: () => void }) {
  const [data, setData] = useState<LawResponse | null>(cache.get(text) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache.has(text)) return;
    apiGet<LawResponse>(`/api/law?ref=${encodeURIComponent(text)}`)
      .then((d) => { cache.set(text, d); setData(d); })
      .catch((e) => setError(e.message));
  }, [text]);

  // derulează la litera căutată (ex. „(f)” din Art. 5(1))
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => document.querySelector("[role=dialog] [data-focus]")?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
    return () => clearTimeout(t);
  }, [data]);

  return (
    <Modal open onClose={onClose} title={`Textul legii — ${text}`} wide>
      {error && <Alert>{error}</Alert>}
      {!data && !error && <div className="flex items-center gap-2 py-6 text-[13px] text-slate-400"><Spinner className="h-4 w-4" /> Se încarcă textul oficial...</div>}
      {data && (
        <div className="space-y-6">
          {data.results.map((r, i) => <LawText key={i} r={r} />)}
          <div className="border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
            {data.source.act}. {data.source.version}{data.source.journal ? ` (JO ${data.source.journal})` : ""}. {data.source.note}{" "}
            <a href={data.results.find((r) => !r.external)?.url ?? data.source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">Vezi pe EUR-Lex ↗</a>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Afișează o trimitere la lege („Art. 26(7)”). Dacă e o trimitere la AI Act, un clic deschide textul oficial.
 * Funcționează și în interiorul unui <label> (nu bifează căsuța).
 */
export function LawRef({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const clickable = parseLawRefs(text).length > 0;
  const base = "rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 whitespace-nowrap";
  if (!clickable) return <span className={cn(base, className)}>{text}</span>;
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={cn(base, "cursor-pointer underline decoration-dotted decoration-slate-400 underline-offset-2 transition hover:bg-brand-soft hover:text-brand hover:decoration-brand", className)}
        title="Vezi textul oficial al legii"
      >
        {text}
      </button>
      {open && <LawModal text={text} onClose={() => setOpen(false)} />}
    </>
  );
}
