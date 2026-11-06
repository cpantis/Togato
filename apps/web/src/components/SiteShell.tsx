import Link from "next/link";
import { LEGAL_DOCUMENTS } from "@togato/shared";
import { Logo } from "@/components/ui";
import { Analytics } from "@/components/Analytics";

const NAV = [
  { href: "/#functionalitati", label: "Funcționalități" },
  { href: "/preturi", label: "Prețuri" },
  { href: "/autoevaluare", label: "Autoevaluare gratuită" },
  { href: "/ajutor", label: "Ajutor" },
];

/** Cadrul paginilor publice de prezentare (pagina principală, prețuri, ajutor). */
export function SiteShell({ children }: { children: React.ReactNode }) {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@togato.ro";
  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5"><Logo size={30} /><span className="text-[16px] font-bold tracking-tight text-ink">Togato</span></Link>
          <nav aria-label="Principal" className="order-3 flex w-full flex-wrap gap-x-4 gap-y-1 text-[13px] sm:order-none sm:w-auto">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="text-slate-600 hover:text-brand">{n.label}</Link>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100">Intră în cont</Link>
            <Link href="/signup" className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">Probă gratuită</Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-[12px] text-slate-600 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2"><Logo size={22} /><b className="text-ink">Togato</b></div>
            <p className="mt-2 leading-relaxed">Platformă pentru cabinetele de avocatură și consultanță: conformitatea clienților cu AI Act și GDPR. Togato nu oferă consultanță juridică; încadrările sunt propuneri pe care avocatul le verifică.</p>
          </div>
          <nav aria-label="Juridic" className="flex flex-col gap-1.5">
            <b className="text-ink">Juridic</b>
            {LEGAL_DOCUMENTS.map((d) => <Link key={d.code} href={d.path} className="hover:text-brand">{d.title}</Link>)}
          </nav>
          <div className="flex flex-col gap-1.5">
            <b className="text-ink">Contact</b>
            <a href={`mailto:${contact}`} className="hover:text-brand">{contact}</a>
            <Link href="/ajutor" className="hover:text-brand">Centrul de ajutor</Link>
          </div>
        </div>
      </footer>
      <Analytics />
    </div>
  );
}
