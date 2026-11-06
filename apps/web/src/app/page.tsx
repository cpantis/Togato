import type { Metadata } from "next";
import Link from "next/link";
import { TRIAL_DAYS } from "@togato/shared";
import { SiteShell } from "@/components/SiteShell";
import { HomeRedirect } from "@/components/HomeRedirect";

export const metadata: Metadata = {
  title: "Togato — conformitatea AI Act și GDPR pentru clienții cabinetului",
  description: "Inventarul sistemelor AI ale clienților, încadrarea propusă după Regulamentul (UE) 2024/1689, obligațiile cu termene, avize înghețate, documente și modulul GDPR, într-un singur loc pentru cabinet.",
};

const FEATURES: { title: string; text: string }[] = [
  { title: "Inventarul AI al fiecărui client", text: "Sistemele AI folosite de firmă — de la recrutare și scoring la chatboți — cu un chestionar ghidat pe articolele regulamentului." },
  { title: "Încadrare propusă, decizia avocatului", text: "Calificarea (Art. 3 și excluderile din Art. 2), rolul (furnizor, implementator, importator, distribuitor) și nivelul de risc. Avocatul aprobă, respinge sau încadrează manual, cu motivare." },
  { title: "Obligații cu termene", text: "Lista obligațiilor aplicabile, cu trimiteri clicabile la textul oficial, termene de aplicare, stări, note și dovezi atașate." },
  { title: "Avize înghețate", text: "La aprobare, avizul se îngheață cu tot ce a stat la baza lui și o amprentă SHA-256 verificată la fiecare descărcare." },
  { title: "Documente Word", text: "Modele generate din datele dosarului: politici, informări, registre — cu câmpurile de completat evidențiate." },
  { title: "Portalul clientului", text: "Firma descrie singură instrumentele folosite, prin întrebări simple; avocatul vede răspunsurile și le încadrează." },
  { title: "GDPR inclus", text: "Registrul prelucrărilor (Art. 30), cererile persoanelor vizate cu termene, incidentele cu termenul de 72 de ore și evaluarea de impact (DPIA)." },
  { title: "Clienți noi din autoevaluare", text: "Firmele își fac gratuit o autoevaluare orientativă și aleg cabinetul din director. Primiți dosarul gata început." },
];

const SECURITY = [
  "Separarea datelor între cabinete verificată și în baza de date (Row-Level Security)",
  "Autentificare în doi pași, sesiuni pe server, jurnal de activitate complet",
  "Acces restricționat pe client și rol de colaborator doar în citire",
  "Echipa Togato vede datele unui cabinet doar cu acordul lui, limitat în timp",
  "Export complet oricând; la închiderea contului, datele se șterg definitiv",
];

export default function Home() {
  return (
    <SiteShell>
      <HomeRedirect />
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:pt-16">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-brand">Pentru cabinete de avocatură și consultanță</p>
        <h1 className="mt-2 max-w-3xl text-[32px] font-bold leading-tight tracking-tight text-ink sm:text-[42px]">Conformitatea AI Act a clienților, organizată de la inventar până la aviz.</h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-slate-600">Togato ține evidența sistemelor AI folosite de firmele-client, propune încadrarea după Regulamentul (UE) 2024/1689 și urmărește obligațiile, termenele și dovezile. Încadrarea rămâne decizia avocatului.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-lg bg-brand px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90">Începe {TRIAL_DAYS} zile de probă</Link>
          <Link href="/preturi" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-[14px] font-semibold text-slate-700 hover:border-slate-400">Vezi prețurile</Link>
        </div>
        <p className="mt-3 text-[12px] text-slate-500">Fără card. După înregistrare puteți explora un client demonstrativ.</p>
      </section>

      <section id="functionalitati" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-[22px] font-bold tracking-tight text-ink">Ce face Togato</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-[14px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-2">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight text-ink">Legislația se schimbă, dosarele se actualizează</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-600">Regulile de încadrare sunt versionate. Când se modifică legislația, sistemele clienților sunt reîncadrate automat: schimbările minore se aplică direct, iar cele de fond revin la avocat pentru verificare, cu diferențele explicate. Notele și stările obligațiilor se păstrează.</p>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-600">Analiza AI opțională (cu acordul cabinetului, care poate exclude orice client) redactează un memoriu cu citări din textul oficial al regulamentului.</p>
        </div>
        <div>
          <h2 className="text-[22px] font-bold tracking-tight text-ink">Securitate și confidențialitate</h2>
          <ul className="mt-3 space-y-2 text-[14px] text-slate-600">
            {SECURITY.map((s) => <li key={s} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{s}</li>)}
          </ul>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[18px] font-bold tracking-tight text-ink">Sunteți o firmă care folosește AI?</h2>
            <p className="mt-1 text-[14px] text-slate-600">Faceți gratuit o autoevaluare orientativă și alegeți un cabinet care să vă asiste.</p>
          </div>
          <Link href="/autoevaluare" className="rounded-lg border border-brand px-5 py-2.5 text-[14px] font-semibold text-brand hover:bg-brand hover:text-white">Autoevaluare gratuită</Link>
        </div>
      </section>
    </SiteShell>
  );
}
