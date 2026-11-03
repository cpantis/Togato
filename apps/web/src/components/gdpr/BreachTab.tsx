"use client";
import { useState } from "react";
import { BREACH_RISK_LABELS, BREACH_TYPES, DATA_CATEGORIES, breachDeadline, breachDuties, type Breach, type BreachRisk } from "@togato/shared";
import { apiDownload, apiPost, apiPut } from "@/lib/api";
import { Alert, Button, Card, EmptyState, Field, Modal, inputClass, textareaClass } from "@/components/ui";
import { CheckList, Pill, fmtDateTime, fromLocalInput, remaining, toLocalInput } from "./common";

type Form = {
  title: string; description: string; breachTypes: string[]; discoveredAt: string; occurredAt: string; dataCategories: string[];
  subjectsAffected: string; recordsAffected: string; risk: BreachRisk; riskReasoning: string; consequences: string; measures: string;
  authorityNotifiedAt: string; authorityReference: string; delayReason: string; subjectsNotifiedAt: string; closed: boolean;
};
const nowLocal = () => toLocalInput(new Date().toISOString());
const EMPTY: Form = { title: "", description: "", breachTypes: [], discoveredAt: nowLocal(), occurredAt: "", dataCategories: [], subjectsAffected: "", recordsAffected: "", risk: "neevaluat", riskReasoning: "", consequences: "", measures: "", authorityNotifiedAt: "", authorityReference: "", delayReason: "", subjectsNotifiedAt: "", closed: false };

function toForm(b: Breach): Form {
  return {
    title: b.title, description: b.description ?? "", breachTypes: b.breachTypes, discoveredAt: toLocalInput(b.discoveredAt), occurredAt: toLocalInput(b.occurredAt),
    dataCategories: b.dataCategories, subjectsAffected: b.subjectsAffected?.toString() ?? "", recordsAffected: b.recordsAffected?.toString() ?? "", risk: b.risk,
    riskReasoning: b.riskReasoning ?? "", consequences: b.consequences ?? "", measures: b.measures ?? "", authorityNotifiedAt: toLocalInput(b.authorityNotifiedAt),
    authorityReference: b.authorityReference ?? "", delayReason: b.delayReason ?? "", subjectsNotifiedAt: toLocalInput(b.subjectsNotifiedAt), closed: !!b.closedAt,
  };
}

function payload(f: Form) {
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  const t = (v: string) => (v.trim() ? v.trim() : null);
  return {
    title: f.title, description: t(f.description), breachTypes: f.breachTypes, discoveredAt: fromLocalInput(f.discoveredAt), occurredAt: fromLocalInput(f.occurredAt),
    dataCategories: f.dataCategories, subjectsAffected: n(f.subjectsAffected), recordsAffected: n(f.recordsAffected), risk: f.risk, riskReasoning: t(f.riskReasoning),
    consequences: t(f.consequences), measures: t(f.measures), authorityNotifiedAt: fromLocalInput(f.authorityNotifiedAt), authorityReference: t(f.authorityReference),
    delayReason: t(f.delayReason), subjectsNotifiedAt: fromLocalInput(f.subjectsNotifiedAt), closed: f.closed,
  };
}

function Status({ b }: { b: Breach }) {
  if (b.closedAt) return <Pill tone="slate">Închis</Pill>;
  if (!b.duties.notifyAuthority) return <Pill tone="green">Doar în registru</Pill>;
  if (b.authorityNotifiedAt) return <Pill tone="green">ANSPDCP notificată</Pill>;
  const r = remaining(b.deadline);
  return <Pill tone={r.overdue ? "red" : "amber"}>Notificare ANSPDCP: {r.text}</Pill>;
}

export function BreachTab({ clientId, items, onChange }: { clientId: string; items: Breach[]; onChange: () => void }) {
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = editing?.form;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEditing((e) => e && { ...e, form: { ...e.form, [k]: v } });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      if (editing.id) await apiPut(`/api/breaches/${editing.id}`, payload(editing.form));
      else await apiPost(`/api/clients/${clientId}/breaches`, payload(editing.form));
      setEditing(null); onChange();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const duties = f ? breachDuties(f.risk) : null;
  const deadline = f?.discoveredAt ? breachDeadline(new Date(f.discoveredAt)) : null;
  const late = !!(deadline && f?.authorityNotifiedAt && new Date(f.authorityNotifiedAt) > deadline);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Incidente de securitate</h2>
          <p className="text-[12px] text-slate-500">Notificarea ANSPDCP în 72 de ore de la luarea la cunoștință (Art. 33); toate incidentele se țin în registru (Art. 33(5)).</p>
        </div>
        <Button size="sm" onClick={() => { setError(null); setEditing({ id: null, form: { ...EMPTY, discoveredAt: nowLocal() } }); }}>Înregistrează un incident</Button>
      </div>
      {!items.length ? <EmptyState title="Niciun incident" text="Un email trimis greșit, un laptop pierdut, un atac ransomware: înregistrați-l imediat — termenul de 72 de ore curge de la descoperire." /> : (
        <ul className="divide-y divide-slate-100">
          {items.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => { setError(null); setEditing({ id: b.id, form: toForm(b) }); }} className="text-left text-[14px] font-semibold text-ink hover:underline">{b.title}</button>
                <div className="text-[12px] text-slate-500">descoperit {fmtDateTime(b.discoveredAt)} · {BREACH_RISK_LABELS[b.risk]}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Status b={b} />
                <button type="button" onClick={() => apiDownload(`/api/breaches/${b.id}/notification`, "notificare.docx").catch((e) => setError(e.message))} className="text-[12px] font-semibold text-brand hover:underline">Notificare .docx</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && !editing && <div className="px-5 pb-3"><Alert>{error}</Alert></div>}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Incident de securitate" : "Incident nou"} wide>
        {f && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Titlu"><input className={inputClass} required minLength={3} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="ex. Laptop pierdut, email trimis greșit" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Luarea la cunoștință" hint="De aici curg cele 72 de ore."><input type="datetime-local" className={inputClass} required value={f.discoveredAt} onChange={(e) => set("discoveredAt", e.target.value)} /></Field>
              <Field label="Producerea (dacă se știe)"><input type="datetime-local" className={inputClass} value={f.occurredAt} onChange={(e) => set("occurredAt", e.target.value)} /></Field>
            </div>
            {deadline && <Alert kind={duties?.notifyAuthority && !f.authorityNotifiedAt && deadline < new Date() ? "error" : "info"}>Termenul de notificare: <b>{fmtDateTime(deadline.toISOString())}</b>. {duties?.summary}</Alert>}
            <Field label="Descriere"><textarea className={textareaClass} rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <CheckList label="Tipul încălcării" options={BREACH_TYPES} value={f.breachTypes} onChange={(v) => set("breachTypes", v)} />
            <CheckList label="Categorii de date afectate" options={DATA_CATEGORIES} value={f.dataCategories} onChange={(v) => set("dataCategories", v)} columns={2} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Persoane afectate (aprox.)"><input type="number" min={0} className={inputClass} value={f.subjectsAffected} onChange={(e) => set("subjectsAffected", e.target.value)} /></Field>
              <Field label="Înregistrări afectate (aprox.)"><input type="number" min={0} className={inputClass} value={f.recordsAffected} onChange={(e) => set("recordsAffected", e.target.value)} /></Field>
            </div>
            <Field label="Evaluarea riscului pentru persoane">
              <select className={inputClass} value={f.risk} onChange={(e) => set("risk", e.target.value as BreachRisk)}>
                {(Object.keys(BREACH_RISK_LABELS) as BreachRisk[]).map((r) => <option key={r} value={r}>{BREACH_RISK_LABELS[r]}</option>)}
              </select>
            </Field>
            <Field label="Motivarea evaluării"><textarea className={textareaClass} rows={2} value={f.riskReasoning} onChange={(e) => set("riskReasoning", e.target.value)} placeholder="ex. datele erau criptate; destinatarul a confirmat ștergerea" /></Field>
            <Field label="Consecințe probabile"><textarea className={textareaClass} rows={2} value={f.consequences} onChange={(e) => set("consequences", e.target.value)} /></Field>
            <Field label="Măsuri luate sau propuse"><textarea className={textareaClass} rows={2} value={f.measures} onChange={(e) => set("measures", e.target.value)} /></Field>
            {duties?.notifyAuthority && (
              <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                <Field label="Notificat ANSPDCP la"><input type="datetime-local" className={inputClass} value={f.authorityNotifiedAt} onChange={(e) => set("authorityNotifiedAt", e.target.value)} /></Field>
                <Field label="Număr de înregistrare ANSPDCP"><input className={inputClass} value={f.authorityReference} onChange={(e) => set("authorityReference", e.target.value)} /></Field>
                {late && <div className="sm:col-span-2"><Field label="Motivele întârzierii (peste 72 de ore)"><textarea className={textareaClass} rows={2} required value={f.delayReason} onChange={(e) => set("delayReason", e.target.value)} /></Field></div>}
                {duties.notifySubjects && <Field label="Persoanele vizate informate la"><input type="datetime-local" className={inputClass} value={f.subjectsNotifiedAt} onChange={(e) => set("subjectsNotifiedAt", e.target.value)} /></Field>}
              </div>
            )}
            {editing?.id && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-brand" checked={f.closed} onChange={(e) => set("closed", e.target.checked)} /> Incidentul este închis</label>}
            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Renunță</Button><Button type="submit" loading={busy}>Salvează</Button></div>
          </form>
        )}
      </Modal>
    </Card>
  );
}
