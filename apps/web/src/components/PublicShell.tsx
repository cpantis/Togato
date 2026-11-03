import Link from "next/link";
import { Logo } from "@/components/ui";

/** Cadrul paginilor publice pentru firme (autoevaluarea). */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/autoevaluare" className="flex items-center gap-2.5"><Logo size={30} /><span className="text-[15px] font-bold tracking-tight text-ink">Togato</span><span className="hidden text-[13px] text-slate-500 sm:inline">· Autoevaluare AI Act</span></Link>
          <Link href="/login" className="text-[12px] font-medium text-slate-500 hover:text-brand">Sunteți avocat? Intrați în cont</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-10 text-[12px] text-slate-500">
        Togato oferă autoevaluarea gratuit. Rezultatul este orientativ și nu constituie consultanță juridică; consultanța o oferă cabinetele de avocatură pe care le alegeți.
      </footer>
    </div>
  );
}
