import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <div className="text-[13px] font-semibold uppercase tracking-wider text-brand">404</div>
        <h1 className="mt-2 text-[22px] font-bold tracking-tight text-ink">Pagina nu există</h1>
        <p className="mt-2 text-[14px] text-slate-500">Linkul poate fi greșit sau resursa a fost ștearsă. Dacă ați primit linkul de la cineva, cereți-i unul nou.</p>
        <Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">Înapoi la panou</Link>
      </div>
    </main>
  );
}
