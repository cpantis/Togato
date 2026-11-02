"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EMPTY_PORTAL_ANSWERS, PORTAL_QUESTIONS, type PortalAnswers, type PortalData } from "@togato/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { DEFAULT_BRAND, softOf, textOn } from "@/lib/brand";
import { Alert, Field, Spinner, cn, inputClass, textareaClass } from "@/components/ui";

const EMPTY_FORM = { name: "", vendor: "", department: "", purpose: "", description: "" };

function BrandButton({ color, children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { color: string }) {
  return (
    <button {...rest} className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold shadow-sm transition hover:opacity-90 disabled:opacity-50", className)} style={{ background: color, color: textOn(color) }}>
      {children}
    </button>
  );
}

function YesNo({ label, help, value, onChange, color }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[14px] text-slate-800">{label}</div>
        {help && <div className="text-[12px] text-slate-500">{help}</div>}
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200">
        {[true, false].map((v) => (
          <button key={String(v)} type="button" onClick={() => onChange(v)} className="px-5 py-1.5 text-[13px] font-semibold transition"
            style={value === v ? { background: color, color: textOn(color) } : { background: "#fff", color: "#64748b" }}>
            {v ? "Da" : "Nu"}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [answers, setAnswers] = useState<PortalAnswers>(EMPTY_PORTAL_ANSWERS);
  const [contact, setContact] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);

  const load = useCallback(() => {
    api<PortalData>(`/api/portal/${encodeURIComponent(token)}`).then(setData).catch((e) => setLoadError(e.message));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  // persoana care completează se ține minte în browser, ca să nu o reintroducă la fiecare instrument
  useEffect(() => {
    try {
      const saved = localStorage.getItem("togato-portal-contact");
      if (saved) setContact(JSON.parse(saved));
    } catch { /* ignorat */ }
  }, []);

  const color = data?.cabinet.brandColor || DEFAULT_BRAND;
  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api(`/api/portal/${encodeURIComponent(token)}/systems`, {
        method: "POST",
        body: JSON.stringify({ ...form, contactName: contact.name, contactEmail: contact.email, answers }),
      });
      try { localStorage.setItem("togato-portal-contact", JSON.stringify(contact)); } catch { /* ignorat */ }
      setThanks(form.name);
      setForm(EMPTY_FORM); setAnswers(EMPTY_PORTAL_ANSWERS); setAdding(false);
      load();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Retrageți „${name}” din listă?`)) return;
    try {
      await api(`/api/portal/${encodeURIComponent(token)}/systems/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="text-[17px] font-semibold text-ink">Link indisponibil</div>
          <p className="mt-2 text-[14px] text-slate-500">{loadError}</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="flex min-h-screen items-center justify-center gap-2 text-[13px] text-slate-400"><Spinner className="h-4 w-4" /> Se încarcă...</div>;

  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      <header style={{ background: color, color: textOn(color) }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5 sm:px-6">
          {data.cabinet.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.cabinet.logoUrl} alt={data.cabinet.name} className="h-10 w-10 rounded-lg bg-white object-contain p-1" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-[14px] font-bold" style={{ background: softOf(textOn(color), 0.18) }}>
              {data.cabinet.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-[16px] font-bold">{data.cabinet.name}</div>
            <div className="truncate text-[13px] opacity-80">Inventarul instrumentelor AI · {data.client.name}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {thanks && <div className="mb-5"><Alert kind="info">Mulțumim! „{thanks}” a fost trimis către {data.cabinet.name}.</Alert></div>}

        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h1 className="text-[20px] font-bold tracking-tight text-ink">Ce instrumente AI folosește firma {data.client.name}?</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            {data.cabinet.name} vă ajută să respectați Regulamentul european privind inteligența artificială (AI Act). Pentru asta, avem nevoie să știm ce instrumente
            bazate pe AI folosiți: de exemplu ChatGPT, Copilot, un chatbot pe site, un program de recrutare sau de evaluare a angajaților.
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">Adăugați câte un instrument pe rând. Nu e nevoie de cunoștințe juridice: răspundeți la întrebări simple, iar avocatul face analiza.</p>
          {!adding && <BrandButton color={color} className="mt-4" onClick={() => { setAdding(true); setThanks(null); }}>+ Adaugă un instrument AI</BrandButton>}
        </section>

        {adding && (
          <form onSubmit={submit} className="mt-5 space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-[16px] font-semibold text-ink">Instrument nou</h2>
            {error && <Alert>{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Numele instrumentului"><input className={inputClass} required minLength={2} placeholder="ex. ChatGPT" value={form.name} onChange={set("name")} /></Field>
              <Field label="Producător / furnizor (dacă știți)"><input className={inputClass} placeholder="ex. OpenAI" value={form.vendor} onChange={set("vendor")} /></Field>
              <Field label="Cine îl folosește"><input className={inputClass} placeholder="ex. departamentul HR, toată firma" value={form.department} onChange={set("department")} /></Field>
              <Field label="La ce îl folosiți"><input className={inputClass} placeholder="ex. scriem oferte comerciale" value={form.purpose} onChange={set("purpose")} /></Field>
            </div>
            <Field label="Descriere (opțional)" hint="Ce informații introduceți în el și ce faceți cu rezultatele.">
              <textarea className={textareaClass} rows={3} value={form.description} onChange={set("description")} />
            </Field>

            <div>
              <div className="mb-1 text-[14px] font-semibold text-ink">Câteva întrebări</div>
              <div className="rounded-lg border border-slate-200 px-4">
                {PORTAL_QUESTIONS.map((q) => (
                  <YesNo key={q.key} label={q.label} help={q.help} value={answers[q.key]} color={color} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />
                ))}
              </div>
            </div>
            <Field label="Altceva ce ar trebui să știe avocatul? (opțional)">
              <textarea className={textareaClass} rows={2} value={answers.notes || ""} onChange={(e) => setAnswers((a) => ({ ...a, notes: e.target.value }))} />
            </Field>

            <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <Field label="Numele dumneavoastră"><input className={inputClass} required minLength={2} autoComplete="name" value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} /></Field>
              <Field label="Email (opțional)" hint="Pentru eventuale întrebări ale avocatului."><input className={inputClass} type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} /></Field>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setAdding(false); setError(null); }} className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Renunță</button>
              <BrandButton color={color} type="submit" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Trimite către cabinet</BrandButton>
            </div>
          </form>
        )}

        <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-ink">Instrumente înregistrate</h2>
          </div>
          {data.systems.length === 0 ? (
            <p className="px-5 py-8 text-center text-[14px] text-slate-500">Niciun instrument încă.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.systems.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{s.name}</div>
                    <div className="truncate text-[12px] text-slate-500">{[s.vendor, s.department, s.purpose].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <span className="text-[12px] text-slate-500">{s.addedBy === "client" ? `Adăugat de dvs. · ${formatDate(s.createdAt)}` : "Adăugat de cabinet"}</span>
                  <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-medium", s.status === "analizat" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                    {s.status === "analizat" ? "Analizat" : "În analiză"}
                  </span>
                  {s.canDelete && <button onClick={() => remove(s.id, s.name)} className="text-[12px] font-medium text-slate-400 hover:text-red-600">Retrage</button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-6 text-center text-[12px] text-slate-400">
          Link personal, valabil până la {formatDate(data.expiresAt)}. Nu îl distribuiți în afara firmei. · Realizat cu Togato
        </p>
      </main>
    </div>
  );
}
