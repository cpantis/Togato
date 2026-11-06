import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, TRIAL_DAYS, TRIAL_LIMITS } from "@togato/shared";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = { title: "Prețuri — Togato", description: "Planurile Togato pentru cabinete: Start, Cabinet și Enterprise. Modulul GDPR este inclus în toate planurile." };

export default function Pricing() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@togato.ro";
  return (
    <SiteShell>
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-[30px] font-bold tracking-tight text-ink">Prețuri</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-slate-600">Începeți cu {TRIAL_DAYS} zile de probă gratuită (până la {TRIAL_LIMITS.maxClients} clienți și {TRIAL_LIMITS.maxUsers} utilizatori), fără card. Modulul GDPR, portalul clientului și clientul demonstrativ sunt incluse în toate planurile.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.code} className={`flex flex-col rounded-2xl border bg-white p-6 ${p.code === "cabinet" ? "border-brand shadow-sm" : "border-slate-200"}`}>
              <h2 className="text-[18px] font-bold text-ink">{p.name}</h2>
              <p className="mt-2 text-[28px] font-bold tracking-tight text-ink">
                {p.priceEur !== null ? <>{p.priceEur} €<span className="text-[13px] font-medium text-slate-500"> / lună, fără TVA</span></> : <span className="text-[20px]">La cerere</span>}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-[13px] text-slate-700">
                {p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden="true" className="text-brand">✓</span>{f}</li>)}
              </ul>
              {p.selfServe
                ? <Link href="/signup" className="mt-6 rounded-lg bg-brand px-4 py-2.5 text-center text-[14px] font-semibold text-white hover:opacity-90">Începe proba gratuită</Link>
                : <a href={`mailto:${contact}?subject=Togato%20Enterprise`} className="mt-6 rounded-lg border border-slate-300 px-4 py-2.5 text-center text-[14px] font-semibold text-slate-700 hover:border-slate-400">Contactați-ne</a>}
            </div>
          ))}
        </div>
        <p className="mt-6 text-[12px] text-slate-500">Prețurile sunt orientative; suma exactă apare la plată. Abonamentul se poate anula oricând din Setări; datele rămân disponibile pentru consultare și export.</p>
      </section>
    </SiteShell>
  );
}
