"use client";
import { useMemo, useState } from "react";
import {
  ANNEX_III_USES, DEROGATIONS, EMPTY_ANSWERS, PROHIBITED_PRACTICES, ROLE_OPTIONS, TRANSPARENCY_TRIGGERS,
  classifyAiSystem, type AiSystemAnswers, type Option,
} from "@togato/shared";
import { Alert, Button, Card, Field, RiskBadge, cn, inputClass, textareaClass } from "@/components/ui";
import { LawRef } from "@/components/LawRef";

export interface SystemFormValue {
  name: string;
  vendor: string;
  description: string;
  purpose: string;
  department: string;
  answers: AiSystemAnswers;
}

export const EMPTY_SYSTEM: SystemFormValue = { name: "", vendor: "", description: "", purpose: "", department: "", answers: EMPTY_ANSWERS };

/** Exemple frecvente — completează numele și furnizorul dintr-un clic */
const PRESETS = [
  { name: "ChatGPT", vendor: "OpenAI" },
  { name: "Microsoft 365 Copilot", vendor: "Microsoft" },
  { name: "Gemini", vendor: "Google" },
  { name: "Claude", vendor: "Anthropic" },
  { name: "Chatbot pe site", vendor: "" },
  { name: "Filtrare CV-uri", vendor: "" },
];

function Section({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">{n}</span>
        <div>
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="text-[12px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function CheckList({ options, value, onChange, tone = "default" }: { options: Option[]; value: string[]; onChange: (v: string[]) => void; tone?: "default" | "danger" }) {
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <div className="space-y-1.5">
      {options.map((o) => {
        const checked = value.includes(o.code);
        return (
          <label key={o.code} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition", checked ? (tone === "danger" ? "border-red-300 bg-red-50" : "border-brand/40 bg-brand-soft") : "border-slate-200 hover:border-slate-300")}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#7a1f3a]" checked={checked} onChange={() => toggle(o.code)} />
            <span className="min-w-0 flex-1 text-[13px] text-slate-700">{o.label}</span>
            <LawRef text={o.article} className="shrink-0" />
          </label>
        );
      })}
    </div>
  );
}

function YesNo({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13px] text-slate-700">{label}</div>
        {help && <div className="text-[12px] text-slate-400">{help}</div>}
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200">
        {[true, false].map((v) => (
          <button key={String(v)} type="button" onClick={() => onChange(v)} className={cn("px-4 py-1.5 text-[12px] font-semibold transition", value === v ? "bg-brand text-white" : "bg-white text-slate-500 hover:bg-slate-50")}>
            {v ? "Da" : "Nu"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SystemForm({ initial, onSubmit, onCancel, submitLabel }: {
  initial: SystemFormValue;
  onSubmit: (v: SystemFormValue) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [v, setV] = useState<SystemFormValue>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = v.answers;
  const setA = <K extends keyof AiSystemAnswers>(k: K, val: AiSystemAnswers[K]) => setV((s) => ({ ...s, answers: { ...s.answers, [k]: val } }));
  const setF = (k: Exclude<keyof SystemFormValue, "answers">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const preview = useMemo(() => classifyAiSystem(a), [a]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await onSubmit(v);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Section n={1} title="Sistemul AI" subtitle="Ce instrument folosește clientul și la ce.">
          {!initial.name && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.name} type="button" onClick={() => setV((s) => ({ ...s, name: p.name, vendor: p.vendor }))} className="rounded-full border border-slate-200 px-3 py-1 text-[12px] text-slate-600 hover:border-brand/40 hover:text-brand">{p.name}</button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nume"><input className={inputClass} required minLength={2} value={v.name} onChange={setF("name")} /></Field>
            <Field label="Furnizor / producător"><input className={inputClass} value={v.vendor} onChange={setF("vendor")} /></Field>
            <Field label="Departament care îl folosește"><input className={inputClass} placeholder="ex. HR, vânzări, toată firma" value={v.department} onChange={setF("department")} /></Field>
            <Field label="Scop"><input className={inputClass} placeholder="ex. preselecția candidaților" value={v.purpose} onChange={setF("purpose")} /></Field>
          </div>
          <div className="mt-4">
            <Field label="Descriere" hint="Ce date intră, ce produce, cine folosește rezultatul. Folosită și de analiza AI.">
              <textarea className={textareaClass} rows={3} value={v.description} onChange={setF("description")} />
            </Field>
          </div>
        </Section>

        <Section n={2} title="Rolul firmei" subtitle="Determină dacă firma are obligații de furnizor sau de implementator.">
          <div className="space-y-1.5">
            {ROLE_OPTIONS.map((r) => (
              <label key={r.code} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition", a.role === r.code ? "border-brand/40 bg-brand-soft" : "border-slate-200 hover:border-slate-300")}>
                <input type="radio" name="role" className="mt-0.5 h-4 w-4 accent-[#7a1f3a]" checked={a.role === r.code} onChange={() => setA("role", r.code)} />
                <span>
                  <span className="block text-[13px] font-medium text-slate-800">{r.label}</span>
                  <span className="block text-[12px] text-slate-500">{r.help}</span>
                </span>
              </label>
            ))}
          </div>
        </Section>

        <Section n={3} title="Practici interzise" subtitle="Bifează doar dacă sistemul e folosit astfel. Interzise din 2 februarie 2025.">
          <CheckList options={PROHIBITED_PRACTICES} value={a.prohibited} onChange={(x) => setA("prohibited", x)} tone="danger" />
        </Section>

        <Section n={4} title="Domenii cu risc ridicat" subtitle="Anexa III — bifează domeniile în care e folosit sistemul.">
          <CheckList options={ANNEX_III_USES} value={a.annexIII} onChange={(x) => setA("annexIII", x)} />
          {a.annexIII.length > 0 && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <div className="mb-2 text-[13px] font-semibold text-slate-700">Derogări (Art. 6(3)) — se aplică vreuna?</div>
              <CheckList options={DEROGATIONS} value={a.derogations} onChange={(x) => setA("derogations", x)} />
              <YesNo label="Sistemul face profilarea persoanelor fizice?" help="Dacă da, derogările nu se aplică." value={a.profiling} onChange={(x) => setA("profiling", x)} />
            </div>
          )}
          <div className="mt-2">
            <YesNo label="E componentă de siguranță a unui produs reglementat?" help="Anexa I: mașini, jucării, ascensoare, dispozitive medicale, vehicule etc." value={a.annexI} onChange={(x) => setA("annexI", x)} />
          </div>
        </Section>

        <Section n={5} title="Transparență" subtitle="Art. 50 — se aplică din 2 august 2026.">
          <CheckList options={TRANSPARENCY_TRIGGERS} value={a.transparency} onChange={(x) => setA("transparency", x)} />
          {a.transparency.includes("text_interes_public") && (
            <YesNo label="Textele trec printr-o revizuire umană, sub responsabilitate editorială?" value={a.editorialReview} onChange={(x) => setA("editorialReview", x)} />
          )}
        </Section>

        <Section n={6} title="Context" subtitle="Precizează ce obligații suplimentare se aplică.">
          <YesNo label="Folosit la locul de muncă, privește angajații?" help="Art. 26(7) — informarea angajaților" value={a.workplace} onChange={(x) => setA("workplace", x)} />
          <YesNo label="Ia sau asistă decizii despre persoane fizice?" help="Art. 26(11) și Art. 86 — informare și dreptul la explicație" value={a.decisionsOnPersons} onChange={(x) => setA("decisionsOnPersons", x)} />
          <YesNo label="Clientul e organism de drept public sau entitate privată care prestează servicii publice?" help="Art. 27 — evaluarea impactului asupra drepturilor fundamentale" value={a.publicService} onChange={(x) => setA("publicService", x)} />
          <YesNo label="Clientul este autoritate publică?" help="Art. 26(8) — înregistrarea utilizării în baza de date a UE" value={a.publicAuthority} onChange={(x) => setA("publicAuthority", x)} />
          <YesNo label="Clientul dezvoltă un model AI de uz general?" help="Regim separat, Capitolul V" value={a.gpaiProvider} onChange={(x) => setA("gpaiProvider", x)} />
        </Section>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Încadrare propusă</div>
          <div className="mt-2 flex items-center gap-2">
            <RiskBadge level={preview.riskLevel} className="text-[13px]" />
            <span className="text-[12px] text-slate-500">{preview.role === "furnizor" ? "Furnizor" : "Implementator"}</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {preview.reasons.slice(0, 5).map((r, i) => (
              <li key={i} className="text-[12px] text-slate-600"><LawRef text={r.article} /> {r.text}</li>
            ))}
          </ul>
          {preview.warnings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {preview.warnings.map((w, i) => <Alert key={i} kind="warning">{w}</Alert>)}
            </div>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3 text-[13px] text-slate-600">
            <b className="text-ink">{preview.obligations.length}</b> obligații pentru acest sistem
          </div>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-4 flex flex-col gap-2">
            <Button type="submit" loading={saving}>{submitLabel}</Button>
            <Button type="button" variant="ghost" onClick={onCancel}>Renunță</Button>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-slate-400">Propunerea nu e o opinie juridică. Avocatul o aprobă sau o respinge după salvare.</p>
        </Card>
      </div>
    </form>
  );
}
