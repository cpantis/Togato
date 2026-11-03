"use client";
import { useState } from "react";
import { DSAR_STATUS_LABELS, DSAR_TYPES, daysBetween, type DsarRequest, type DsarStatus, type DsarType } from "@togato/shared";
import { apiPatch, apiPost } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, EmptyState, Field, Modal, inputClass, textareaClass } from "@/components/ui";
import { Pill } from "./common";

const today = () => new Date().toISOString().slice(0, 10);

function DueBadge({ d }: { d: DsarRequest }) {
  if (d.status === "finalizata" || d.status === "respinsa") return <Pill tone="slate">{DSAR_STATUS_LABELS[d.status]} {d.closedOn ? formatDate(d.closedOn) : ""}</Pill>;
  const left = daysBetween(today(), d.dueOn);
  return left < 0 ? <Pill tone="red">Termen depășit cu {-left} zile</Pill> : <Pill tone={left <= 7 ? "amber" : "sky"}>Termen {formatDate(d.dueOn)} · {left} zile</Pill>;
}

export function DsarTab({ clientId, items, onChange }: { clientId: string; items: DsarRequest[]; onChange: () => void }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: "acces" as DsarType, requesterName: "", requesterContact: "", receivedOn: today(), details: "" });
  const [open, setOpen] = useState<DsarRequest | null>(null);
  const [outcome, setOutcome] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await apiPost(`/api/clients/${clientId}/dsar`, { ...form, requesterContact: form.requesterContact || null, details: form.details || null });
      setCreating(false); setForm({ type: "acces", requesterName: "", requesterContact: "", receivedOn: today(), details: "" }); onChange();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function patch(body: Record<string, unknown>) {
    if (!open) return;
    setBusy(true); setError(null);
    try { setOpen(await apiPatch<DsarRequest>(`/api/dsar/${open.id}`, body)); setExtendReason(""); onChange(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const openReq = items.filter((d) => d.status === "primita" || d.status === "in_lucru").length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Cererile persoanelor vizate</h2>
          <p className="text-[12px] text-slate-500">Răspuns în cel mult o lună de la primire, prelungibil cu încă două luni, motivat (Art. 12(3)). {openReq > 0 && <b>{openReq} deschise.</b>}</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>Înregistrează o cerere</Button>
      </div>
      {!items.length ? <EmptyState title="Nicio cerere" text="Înregistrați aici cererile de acces, ștergere, rectificare sau opoziție primite de client, ca să nu depășiți termenul legal." /> : (
        <ul className="divide-y divide-slate-100">
          {items.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => { setOpen(d); setOutcome(d.outcome ?? ""); setError(null); }} className="flex w-full flex-col gap-1 px-5 py-3 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-ink">{DSAR_TYPES.find((t) => t.code === d.type)?.label} — {d.requesterName}</div>
                  <div className="text-[12px] text-slate-500">primită {formatDate(d.receivedOn)}{d.extended ? " · termen prelungit" : ""}{!d.identityVerified && d.status !== "finalizata" ? " · identitate neverificată" : ""}</div>
                </div>
                <DueBadge d={d} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Cerere nouă">
        <form onSubmit={create} className="space-y-3">
          {error && <Alert>{error}</Alert>}
          <Field label="Tipul cererii">
            <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DsarType })}>
              {DSAR_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label} ({t.article})</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Solicitant"><input className={inputClass} required minLength={2} value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} /></Field>
            <Field label="Contact (opțional)"><input className={inputClass} value={form.requesterContact} onChange={(e) => setForm({ ...form, requesterContact: e.target.value })} /></Field>
          </div>
          <Field label="Data primirii" hint="Termenul curge de la primirea cererii de către client."><input type="date" className={inputClass} required max={today()} value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} /></Field>
          <Field label="Detalii (opțional)"><textarea className={textareaClass} rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCreating(false)}>Renunță</Button><Button type="submit" loading={busy}>Salvează</Button></div>
        </form>
      </Modal>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${DSAR_TYPES.find((t) => t.code === open.type)?.label} — ${open.requesterName}` : ""}>
        {open && (
          <div className="space-y-4 text-[13px]">
            {error && <Alert>{error}</Alert>}
            <div className="flex flex-wrap gap-2"><DueBadge d={open} />{open.extended && <Pill tone="slate">Prelungit: {open.extensionReason}</Pill>}</div>
            <p className="text-slate-600">Primită {formatDate(open.receivedOn)}{open.requesterContact ? ` · ${open.requesterContact}` : ""}. {DSAR_TYPES.find((t) => t.code === open.type)?.article} GDPR.</p>
            {open.details && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-slate-700">{open.details}</p>}
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-brand" checked={open.identityVerified} onChange={(e) => patch({ identityVerified: e.target.checked })} /> Identitatea solicitantului a fost verificată (Art. 12(6))</label>
            {(open.status === "primita" || open.status === "in_lucru") && (
              <>
                {open.status === "primita" && <Button size="sm" variant="secondary" loading={busy} onClick={() => patch({ status: "in_lucru" })}>Marchează „în lucru”</Button>}
                {!open.extended && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <Field label="Prelungirea termenului cu două luni" hint="Doar pentru cereri complexe sau numeroase; informați solicitantul în prima lună, cu motivele."><input className={inputClass} value={extendReason} onChange={(e) => setExtendReason(e.target.value)} placeholder="Motivul prelungirii" /></Field>
                    <Button size="sm" variant="secondary" className="mt-2" disabled={extendReason.trim().length < 10} loading={busy} onClick={() => patch({ extend: { reason: extendReason } })}>Prelungește termenul</Button>
                  </div>
                )}
              </>
            )}
            <Field label="Răspunsul dat solicitantului"><textarea className={textareaClass} rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="ex. Copia datelor a fost trimisă pe email la..." /></Field>
            <div className="flex flex-wrap justify-end gap-2">
              {(["finalizata", "respinsa"] as DsarStatus[]).map((s) => (
                <Button key={s} size="sm" variant={s === "finalizata" ? "primary" : "secondary"} loading={busy} disabled={!outcome.trim()} onClick={() => patch({ status: s, outcome })}>{s === "finalizata" ? "Finalizează" : "Respinge (motivat)"}</Button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
