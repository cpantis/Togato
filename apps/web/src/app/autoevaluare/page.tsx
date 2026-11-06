"use client";
import { useState } from "react";
import { Captcha } from "@/components/Captcha";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JUDETE, SELF_ASSESSMENT_DISCLAIMER } from "@togato/shared";
import { api } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";

const STEPS = [
  ["Răspundeți la câteva întrebări simple", "pentru fiecare instrument AI folosit în firmă (ChatGPT, un chatbot, un program de HR...)."],
  ["Vedeți imediat rezultatul", "nivelul de risc orientativ al fiecărui instrument și obligațiile firmei după AI Act."],
  ["Alegeți, dacă doriți, un cabinet de avocatură", "după județ sau nume, și trimiteți-i autoevaluarea gata completată."],
];

export default function SelfAssessmentStart() {
  const router = useRouter();
  const [form, setForm] = useState({ companyName: "", cui: "", county: "", contactName: "", contactEmail: "", website: "" });
  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api<{ token: string }>("/api/self-assessments", { method: "POST", body: JSON.stringify({ ...form, cui: form.cui || null, county: form.county || null, website: form.website || undefined, terms, captchaToken: captcha ?? undefined }) });
      router.push(`/autoevaluare/${res.token}`);
    } catch (err) {
      setError((err as Error).message);
      setCaptcha(null); setCaptchaKey((k) => k + 1);
      setBusy(false);
    }
  }

  return (
    <PublicShell>
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-brand">Gratuit · fără cont · 10 minute</div>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-ink">Ce obligații are firma dumneavoastră după AI Act?</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">Regulamentul european privind inteligența artificială se aplică oricărei firme care folosește instrumente AI — de la ChatGPT la programe de recrutare. Aflați în câteva minute ce aveți de făcut.</p>
          <ol className="mt-6 space-y-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white">{i + 1}</span>
                <p className="text-[14px] text-slate-600"><b className="text-ink">{title}</b> {text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 rounded-lg border border-slate-200 bg-white p-3 text-[12px] leading-relaxed text-slate-500">{SELF_ASSESSMENT_DISCLAIMER}</p>
        </div>
        <Card className="h-fit p-5">
          <h2 className="text-[15px] font-semibold text-ink">Începeți autoevaluarea</h2>
          <form onSubmit={submit} className="mt-4 space-y-3">
            {error && <Alert>{error}</Alert>}
            <Field label="Denumirea firmei"><input className={inputClass} required minLength={2} value={form.companyName} onChange={set("companyName")} autoComplete="organization" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CUI (opțional)"><input className={inputClass} value={form.cui} onChange={set("cui")} inputMode="numeric" /></Field>
              <Field label="Județul">
                <select className={inputClass} value={form.county} onChange={set("county")}>
                  <option value="">—</option>
                  {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Numele dumneavoastră"><input className={inputClass} required minLength={2} value={form.contactName} onChange={set("contactName")} autoComplete="name" /></Field>
            <Field label="Email" hint="Vă trimitem linkul autoevaluării, ca să puteți reveni."><input className={inputClass} type="email" required value={form.contactEmail} onChange={set("contactEmail")} autoComplete="email" /></Field>
            {/* câmp-capcană pentru roboți: invizibil pentru oameni */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={form.website} onChange={set("website")} name="website" />
            <label className="flex items-start gap-2 text-[12px] text-slate-600">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
              <span>Am înțeles că rezultatul este orientativ și nu constituie consultanță juridică. Datele introduse se păstrează pentru autoevaluare și se transmit unui cabinet numai dacă aleg eu acest lucru; le pot șterge oricând.</span>
            </label>
            <Captcha key={captchaKey} onToken={setCaptcha} />
            <Button type="submit" className="w-full" loading={busy}>Continuă</Button>
          </form>
          <p className="mt-4 text-center text-[12px] text-slate-500">Ați început deja o autoevaluare? <Link href="/autoevaluare/recuperare" className="font-semibold text-brand hover:underline">Primiți din nou linkul</Link></p>
        </Card>
      </div>
    </PublicShell>
  );
}
