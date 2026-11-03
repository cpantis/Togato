"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ANSPDCP_DPIA_LIST, DPIA_OUTCOME_LABELS, DATA_CATEGORIES, LEGAL_BASES, PROCESSING_ROLES, SECURITY_MEASURES, SPECIAL_CONDITIONS, SUBJECT_CATEGORIES, TRANSFER_MECHANISMS,
  checkProcessing, type AiSystem, type ProcessingActivity,
} from "@togato/shared";
import { apiDelete, apiDownload, apiPost, apiPut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, EmptyState, Field, Modal, inputClass, textareaClass } from "@/components/ui";
import { CheckList, Pill } from "./common";

type Form = Omit<ProcessingActivity, "id" | "clientId" | "updatedAt" | "check" | "dpia">;
const EMPTY: Form = {
  name: "", purpose: "", role: "operator", controllerName: null, legalBases: [], legalBasisDetails: null, specialConditions: [], dataCategories: [],
  subjectCategories: [], recipients: null, transferOutsideEea: false, transferCountries: null, transferMechanism: null, retention: null,
  securityMeasures: [], securityDetails: null, largeScale: false, systematicMonitoring: false, automatedDecisions: false, dpiaListItems: [], aiSystemIds: [], notes: null,
};
const SPECIAL = new Set(DATA_CATEGORIES.filter((d) => d.special).map((d) => d.code));

/** activități tipice, ca punct de plecare */
const PRESETS: { label: string; form: Partial<Form> }[] = [
  { label: "Salarizare și personal", form: { name: "Gestiunea personalului și salarizare", purpose: "Încheierea și executarea contractelor de muncă, calculul și plata salariilor, raportări către ANAF, ITM (REVISAL) și casele de asigurări.", legalBases: ["6_1_b", "6_1_c"], dataCategories: ["identificare", "contact", "financiare", "angajare"], subjectCategories: ["angajati"], recipients: "ANAF, ITM, CNPP, CNAS, bănci, furnizorul de salarizare (dacă e externalizată)", retention: "Statele de plată: 50 de ani (Legea 16/1996); dosarul de personal: 75 de ani de la nașterea angajatului" } },
  { label: "Recrutare", form: { name: "Recrutare și selecție", purpose: "Evaluarea candidaților pentru posturile vacante.", legalBases: ["6_1_b"], dataCategories: ["identificare", "contact", "educatie", "angajare"], subjectCategories: ["candidati"], retention: "Până la finalizarea recrutării; cu acordul candidatului, maximum 1 an pentru posturi viitoare" } },
  { label: "Clienți și facturare", form: { name: "Evidența clienților și facturare", purpose: "Executarea contractelor cu clienții, facturare, evidența contabilă.", legalBases: ["6_1_b", "6_1_c"], dataCategories: ["identificare", "contact", "financiare"], subjectCategories: ["clienti", "reprezentanti"], recipients: "Contabilitate externă, ANAF, bănci, curier", retention: "Documentele contabile: 5 ani; registrele: 10 ani (Legea contabilității 82/1991)" } },
  { label: "Supraveghere video", form: { name: "Supraveghere video", purpose: "Securitatea persoanelor, a spațiilor și a bunurilor.", legalBases: ["6_1_f"], dataCategories: ["imagine"], subjectCategories: ["angajati", "vizitatori"], retention: "Maximum 30 de zile, cu excepția înregistrărilor necesare într-o investigație", systematicMonitoring: true } },
  { label: "Marketing pe email", form: { name: "Comunicări de marketing", purpose: "Trimiterea de oferte și newslettere.", legalBases: ["6_1_a"], dataCategories: ["contact", "online"], subjectCategories: ["clienti", "public"], recipients: "Platforma de email marketing", retention: "Până la retragerea consimțământului" } },
];

function ActivityForm({ initial, systems, onSave, onCancel, busy }: { initial: Form; systems: AiSystem[]; onSave: (f: Form) => void; onCancel: () => void; busy: boolean }) {
  const [f, setF] = useState<Form>(initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const live = checkProcessing({ ...f, usesAi: f.aiSystemIds.length > 0 });
  const hasSpecial = f.dataCategories.some((c) => SPECIAL.has(c));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Denumirea activității"><input className={inputClass} required minLength={2} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Calitatea firmei">
          <select className={inputClass} value={f.role} onChange={(e) => set("role", e.target.value as Form["role"])}>
            {PROCESSING_ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </Field>
      </div>
      {f.role !== "operator" && <Field label={f.role === "operator_asociat" ? "Celălalt operator" : "Operatorul în numele căruia prelucrează"}><input className={inputClass} value={f.controllerName ?? ""} onChange={(e) => set("controllerName", e.target.value || null)} /></Field>}
      <Field label="Scopul prelucrării"><textarea className={textareaClass} rows={2} required minLength={3} value={f.purpose} onChange={(e) => set("purpose", e.target.value)} /></Field>
      <CheckList label="Temeiul legal (Art. 6)" options={LEGAL_BASES} value={f.legalBases} onChange={(v) => set("legalBases", v)} columns={2} />
      <Field label="Detalii despre temei (opțional)" hint="ex. actul normativ pentru obligația legală, analiza interesului legitim"><input className={inputClass} value={f.legalBasisDetails ?? ""} onChange={(e) => set("legalBasisDetails", e.target.value || null)} /></Field>
      <CheckList label="Persoane vizate" options={SUBJECT_CATEGORIES} value={f.subjectCategories} onChange={(v) => set("subjectCategories", v)} columns={2} />
      <CheckList label="Categorii de date" options={DATA_CATEGORIES} value={f.dataCategories} onChange={(v) => set("dataCategories", v)} columns={2} />
      {hasSpecial && <CheckList label="Condiția pentru categoriile speciale (Art. 9(2))" options={SPECIAL_CONDITIONS} value={f.specialConditions} onChange={(v) => set("specialConditions", v)} />}
      <Field label="Destinatari"><textarea className={textareaClass} rows={2} value={f.recipients ?? ""} onChange={(e) => set("recipients", e.target.value || null)} placeholder="ex. contabilitate externă, ANAF, furnizori IT" /></Field>
      <label className="flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" className="h-4 w-4 accent-brand" checked={f.transferOutsideEea} onChange={(e) => set("transferOutsideEea", e.target.checked)} /> Datele sunt transferate în afara Spațiului Economic European</label>
      {f.transferOutsideEea && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Țări"><input className={inputClass} value={f.transferCountries ?? ""} onChange={(e) => set("transferCountries", e.target.value || null)} placeholder="ex. SUA" /></Field>
          <Field label="Mecanismul de transfer">
            <select className={inputClass} value={f.transferMechanism ?? ""} onChange={(e) => set("transferMechanism", e.target.value || null)}>
              <option value="">—</option>
              {TRANSFER_MECHANISMS.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </Field>
        </div>
      )}
      <Field label="Termenul de păstrare"><input className={inputClass} value={f.retention ?? ""} onChange={(e) => set("retention", e.target.value || null)} /></Field>
      <CheckList label="Măsuri de securitate (Art. 32)" options={SECURITY_MEASURES} value={f.securityMeasures} onChange={(v) => set("securityMeasures", v)} columns={2} />
      <fieldset>
        <legend className="mb-1 text-[13px] font-medium text-slate-700">Criterii de risc (pentru evaluarea de impact)</legend>
        {([["largeScale", "Prelucrare la scară largă"], ["systematicMonitoring", "Monitorizare sistematică (ex. GPS, CCTV, monitorizarea activității)"], ["automatedDecisions", "Decizii automate cu efecte juridice sau similare"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 px-2 py-1 text-[13px] text-slate-700"><input type="checkbox" className="h-4 w-4 accent-brand" checked={f[k]} onChange={(e) => set(k, e.target.checked)} /> {l}</label>
        ))}
      </fieldset>
      <CheckList label="Operațiuni din lista ANSPDCP pentru care evaluarea de impact e obligatorie (Decizia nr. 174/2018)" options={ANSPDCP_DPIA_LIST} value={f.dpiaListItems} onChange={(v) => set("dpiaListItems", v)} />
      {systems.length > 0 && (
        <CheckList label="Sisteme AI folosite (din inventarul clientului)" options={systems.map((s) => ({ code: s.id, label: s.name }))} value={f.aiSystemIds} onChange={(v) => set("aiSystemIds", v)} columns={2} />
      )}
      <div className="space-y-2" aria-live="polite">
        {live.issues.map((t) => <Alert key={t} kind="warning">{t}</Alert>)}
        {live.dpiaMandatory
          ? <Alert kind="warning">Evaluarea de impact (Art. 35) este obligatorie: {live.dpiaMandatoryReasons.join("; ")}.</Alert>
          : live.dpiaLikely && <Alert kind="info">Evaluarea de impact (Art. 35) e probabil necesară: {live.dpiaReasons.join(", ")}.</Alert>}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Renunță</Button>
        <Button type="submit" loading={busy}>Salvează</Button>
      </div>
    </form>
  );
}

export function ProcessingTab({ clientId, items, systems, onChange }: { clientId: string; items: ProcessingActivity[]; systems: AiSystem[]; onChange: () => void }) {
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(form: Form) {
    setBusy(true); setError(null);
    try {
      if (editing?.id) await apiPut(`/api/processing/${editing.id}`, form);
      else await apiPost(`/api/clients/${clientId}/processing`, form);
      setEditing(null); onChange();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(a: ProcessingActivity) {
    if (!confirm(`Ștergeți activitatea „${a.name}” din registru?`)) return;
    try { await apiDelete(`/api/processing/${a.id}`); onChange(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Registrul activităților de prelucrare</h2>
          <p className="text-[12px] text-slate-500">Art. 30 GDPR — obligatoriu pentru majoritatea firmelor cu angajați.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={!items.length} onClick={() => apiDownload(`/api/clients/${clientId}/gdpr/ropa`, "registru.docx").catch((e) => setError(e.message))}>Descarcă .docx</Button>
          <Button size="sm" onClick={() => setEditing({ id: null, form: EMPTY })}>Adaugă activitate</Button>
        </div>
      </div>
      {error && <div className="px-5 pt-3"><Alert>{error}</Alert></div>}
      {!items.length ? (
        <div>
          <EmptyState title="Registrul e gol" text="Începeți de la o activitate tipică și adaptați-o." />
          <div className="flex flex-wrap justify-center gap-2 px-5 pb-6">
            {PRESETS.map((p) => <Button key={p.label} size="sm" variant="secondary" onClick={() => setEditing({ id: null, form: { ...EMPTY, ...p.form } })}>{p.label}</Button>)}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => { const { id, clientId: _c, updatedAt: _u, check: _k, dpia: _d, ...form } = a; setEditing({ id, form }); }} className="text-left text-[14px] font-semibold text-ink hover:underline">{a.name}</button>
                <div className="truncate text-[12px] text-slate-500">{a.purpose}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {a.check.issues.length > 0 ? <Pill tone="amber">{a.check.issues.length} de completat</Pill> : <Pill tone="green">Complet</Pill>}
                {a.dpia
                  ? <Link href={`/clients/${clientId}/gdpr/dpia/${a.id}`}><Pill tone={a.dpia.outcome === "consultare_prealabila" ? "red" : a.dpia.finalizedAt ? "green" : "amber"}>DPIA {a.dpia.finalizedAt ? "finalizată" : "în lucru"}</Pill></Link>
                  : a.check.dpiaMandatory ? <Link href={`/clients/${clientId}/gdpr/dpia/${a.id}`}><Pill tone="red">DPIA obligatorie</Pill></Link>
                  : a.check.dpiaLikely && <Link href={`/clients/${clientId}/gdpr/dpia/${a.id}`}><Pill tone="sky">DPIA probabilă</Pill></Link>}
                <Link href={`/clients/${clientId}/gdpr/dpia/${a.id}`} className="text-[12px] font-semibold text-brand hover:underline" title={a.dpia ? DPIA_OUTCOME_LABELS[a.dpia.outcome] : undefined}>Evaluare de impact</Link>
                {a.aiSystemIds.length > 0 && <Pill tone="slate">AI</Pill>}
                <span className="text-[11px] text-slate-500">{formatDate(a.updatedAt)}</span>
                <button type="button" onClick={() => remove(a)} className="ml-1 text-[12px] text-slate-500 hover:text-red-700">Șterge</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Activitate de prelucrare" : "Activitate nouă"} wide>
        {editing && <ActivityForm initial={editing.form} systems={systems} busy={busy} onCancel={() => setEditing(null)} onSave={save} />}
        {error && editing && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Modal>
    </Card>
  );
}
