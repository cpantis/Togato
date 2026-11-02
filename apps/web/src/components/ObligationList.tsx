"use client";
import { useState } from "react";
import type { Obligation, ObligationStatus } from "@togato/shared";
import { apiPatch } from "@/lib/api";
import { daysUntil, formatDate } from "@/lib/format";
import { ObligationStatusSelect, cn, inputClass, textareaClass } from "@/components/ui";

function ObligationRow({ item, onChange }: { item: Obligation; onChange: (o: Obligation) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(item.note || "");
  const [dueDate, setDueDate] = useState(item.dueDate || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = daysUntil(item.appliesFrom);

  async function patch(data: Partial<{ status: ObligationStatus; note: string | null; dueDate: string | null }>) {
    setSaving(true); setError(null);
    try {
      onChange(await apiPatch<Obligation>(`/api/obligations/${item.id}`, data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = note !== (item.note || "") || dueDate !== (item.dueDate || "");

  return (
    <li className={cn("px-4 py-3", item.status === "nu_se_aplica" && "opacity-60")}>
      <div className="flex items-start gap-3">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{item.article}</span>
            <span className={cn("text-[13px] font-semibold text-ink", item.status === "indeplinit" && "text-slate-500")}>{item.title}</span>
            {item.recommended && <span className="text-[11px] font-medium text-slate-400">recomandat</span>}
          </div>
          <div className="mt-0.5 text-[12px] text-slate-500">
            {days > 0 ? `Se aplică din ${formatDate(item.appliesFrom)} (în ${days} zile)` : `În vigoare din ${formatDate(item.appliesFrom)}`}
            {item.dueDate && <> · termen intern <b className="font-semibold text-slate-600">{formatDate(item.dueDate)}</b></>}
            {item.note && !open && <> · <span className="italic">{item.note.length > 60 ? item.note.slice(0, 60) + "…" : item.note}</span></>}
          </div>
        </button>
        <ObligationStatusSelect value={item.status} disabled={saving} onChange={(status) => patch({ status })} />
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
          <p className="text-[13px] text-slate-600">{item.description}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <textarea className={textareaClass} rows={2} placeholder="Notă internă: ce s-a făcut, unde e dovada..." value={note} onChange={(e) => setNote(e.target.value)} />
            <input className={inputClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Termen intern" />
          </div>
          {error && <div className="text-[12px] text-red-600">{error}</div>}
          {dirty && (
            <div className="flex justify-end">
              <button onClick={() => patch({ note: note || null, dueDate: dueDate || null })} disabled={saving} className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                {saving ? "Se salvează..." : "Salvează"}
              </button>
            </div>
          )}
        </div>
      )}
      {error && !open && <div className="mt-1 text-[12px] text-red-600">{error}</div>}
    </li>
  );
}

export function ObligationList({ items, onChange }: { items: Obligation[]; onChange: (o: Obligation) => void }) {
  if (items.length === 0) return <p className="px-4 py-6 text-center text-[13px] text-slate-400">Nicio obligație.</p>;
  return <ul className="divide-y divide-slate-100">{items.map((o) => <ObligationRow key={o.id} item={o} onChange={onChange} />)}</ul>;
}
