"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiDelete, apiDownload, apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Spinner } from "@/components/ui";

type Evidence = { id: string; fileName: string; size: number; note: string | null; uploadedByName: string | null; createdAt: string };

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.odt,.txt,.csv";

function fmtSize(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function csrf() {
  const m = document.cookie.match(/(?:^|;\s*)togato_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

/** Dovezile unei obligații: listă, încărcare, descărcare, ștergere. */
export function EvidencePanel({ obligationId }: { obligationId: string }) {
  const [items, setItems] = useState<Evidence[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    apiGet<{ data: Evidence[] }>(`/api/obligations/${obligationId}/evidence`).then((r) => setItems(r.data)).catch((e) => setError(e.message));
  }, [obligationId]);
  useEffect(() => { load(); }, [load]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 15 * 1024 * 1024) throw new Error(`„${f.name}” depășește 15 MB.`);
        const form = new FormData();
        form.append("file", f);
        const res = await fetch(`/api/obligations/${obligationId}/evidence`, { method: "POST", body: form, credentials: "same-origin", headers: { "X-CSRF-Token": csrf() } });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new ApiError(body?.error || `Eroare ${res.status}`, res.status, body);
        }
      }
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(e: Evidence) {
    if (!confirm(`Ștergeți „${e.fileName}”? Fișierul nu mai poate fi recuperat.`)) return;
    try { await apiDelete(`/api/evidence/${e.id}`); load(); } catch (err) { setError((err as Error).message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-slate-600">Dovezi {items && items.length > 0 && <span className="font-normal text-slate-400">({items.length})</span>}</div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
          Atașează
          <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => onFiles(e.target.files)} aria-label="Atașează dovezi" />
        </label>
      </div>
      {error && <div className="mt-1 text-[12px] text-red-600" role="alert">{error}</div>}
      {items && items.length === 0 && <p className="mt-1 text-[12px] text-slate-400">Procese-verbale, politici semnate, capturi de ecran — PDF, imagini sau documente Office, maximum 15 MB.</p>}
      {items && items.length > 0 && (
        <ul className="mt-1.5 divide-y divide-slate-200/70 rounded-md border border-slate-200 bg-white">
          {items.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]">
              <button onClick={() => apiDownload(`/api/evidence/${e.id}`, e.fileName).catch((err) => setError(err.message))} className="min-w-0 flex-1 truncate text-left font-medium text-brand hover:underline">{e.fileName}</button>
              <span className="shrink-0 text-slate-400">{fmtSize(e.size)} · {formatDate(e.createdAt)}{e.uploadedByName ? ` · ${e.uploadedByName}` : ""}</span>
              <button onClick={() => remove(e)} className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Șterge ${e.fileName}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
