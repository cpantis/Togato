import Link from "next/link";
import { LEGAL_DOCUMENTS, LEGAL_VERSION } from "@togato/shared";
import { LEGAL_TEXTS } from "@/content/legal";
import { Markdown } from "@/components/Markdown";
import { Logo } from "@/components/ui";

/** Pagină juridică publică (termeni, confidențialitate, DPA, subîmputerniciți). */
export function LegalPage({ code }: { code: string }) {
  const doc = LEGAL_TEXTS[code];
  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5"><Logo size={28} /><span className="font-bold tracking-tight text-ink">Togato</span></Link>
          <nav className="flex flex-wrap gap-3 text-[12px]">
            {LEGAL_DOCUMENTS.map((d) => <Link key={d.code} href={d.path} className={d.code === code ? "font-semibold text-brand" : "text-slate-600 hover:text-brand"}>{d.title.split(" (")[0]}</Link>)}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900" role="note">
          <b>Proiect</b> — text în curs de revizuire juridică. Versiunea {LEGAL_VERSION}.
        </div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink">{doc.title}</h1>
        <article className="legal mt-4 rounded-xl border border-slate-200 bg-white p-6"><Markdown text={doc.body} /></article>
      </main>
    </div>
  );
}
