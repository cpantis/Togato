"use client";
import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center" role="alert">
        <h1 className="text-[22px] font-bold tracking-tight text-ink">Ceva n-a mers</h1>
        <p className="mt-2 text-[14px] text-slate-500">A apărut o eroare neprevăzută la afișarea paginii. Datele dumneavoastră nu au fost afectate.</p>
        {error.digest && <p className="mt-2 text-[12px] text-slate-400">Cod pentru suport: <code>{error.digest}</code></p>}
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">Reîncearcă</button>
          <Link href="/dashboard" className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Panou</Link>
        </div>
      </div>
    </main>
  );
}
