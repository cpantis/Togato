import type { Metadata } from "next";
import { HELP } from "@/content/help";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = { title: "Ajutor — Togato", description: "Întrebări frecvente despre Togato: primii pași, încadrarea sistemelor AI, portalul clientului, GDPR, securitate și abonament." };

export default function Help() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@togato.ro";
  return (
    <SiteShell>
      <section className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-[30px] font-bold tracking-tight text-ink">Centrul de ajutor</h1>
        <p className="mt-2 text-[14px] text-slate-600">Nu găsiți răspunsul? Scrieți-ne la <a className="font-semibold text-brand hover:underline" href={`mailto:${contact}`}>{contact}</a>.</p>
        <nav aria-label="Secțiuni" className="mt-5 flex flex-wrap gap-2">
          {HELP.map((s) => <a key={s.id} href={`#${s.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 hover:border-brand hover:text-brand">{s.title}</a>)}
        </nav>
        {HELP.map((s) => (
          <section key={s.id} id={s.id} className="mt-8">
            <h2 className="text-[18px] font-bold tracking-tight text-ink">{s.title}</h2>
            <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {s.items.map((i) => (
                <details key={i.q} className="group px-4 py-3">
                  <summary className="cursor-pointer list-none text-[14px] font-semibold text-ink marker:hidden">
                    <span className="mr-2 inline-block text-brand transition group-open:rotate-90" aria-hidden="true">›</span>{i.q}
                  </summary>
                  <p className="mt-2 pl-4 text-[13px] leading-relaxed text-slate-600">{i.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </section>
    </SiteShell>
  );
}
