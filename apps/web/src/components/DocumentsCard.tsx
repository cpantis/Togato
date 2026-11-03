"use client";
import { useCallback, useEffect, useState } from "react";
import { apiDownload, apiGet } from "@/lib/api";
import { documentUrl } from "@/lib/documents";
import { Alert, Button, Card, Spinner } from "@/components/ui";

interface DocItem {
  type: string;
  title: string;
  description: string;
  perSystem: boolean;
  available: boolean;
  unavailableReason: string | null;
  systems: { id: string; name: string }[];
}

function DocIcon() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>
    </div>
  );
}

export function DocumentsCard({ clientId, refreshKey }: { clientId: string; refreshKey?: unknown }) {
  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<{ data: DocItem[] }>(`/api/clients/${clientId}/documents`).then((r) => setDocs(r.data)).catch((e) => setError(e.message));
  }, [clientId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function download(type: string, systemId?: string) {
    const key = `${type}:${systemId ?? ""}`;
    setBusy(key); setError(null);
    try {
      await apiDownload(documentUrl(clientId, type, systemId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-[14px] font-semibold text-ink">Documente</h2>
        <p className="text-[12px] text-slate-500">Modele Word completate din datele clientului. Câmpurile evidențiate cu galben se completează de avocat.</p>
      </div>
      {error && <div className="px-5 pt-3"><Alert>{error}</Alert></div>}
      {!docs ? (
        <div className="flex items-center gap-2 px-5 py-6 text-[13px] text-slate-400"><Spinner className="h-4 w-4" /> Se încarcă...</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {docs.map((d) => (
            <li key={d.type} className={`flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center ${d.available ? "" : "bg-slate-50/60"}`}>
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <DocIcon />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{d.title}</div>
                  <div className="text-[12px] text-slate-500">{d.available ? d.description : d.unavailableReason}</div>
                </div>
              </div>
              {d.available && (
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  {d.perSystem ? d.systems.map((s) => (
                    <Button key={s.id} size="sm" variant="secondary" loading={busy === `${d.type}:${s.id}`} disabled={!!busy} onClick={() => download(d.type, s.id)}>
                      {s.name}
                    </Button>
                  )) : (
                    <Button size="sm" variant="secondary" loading={busy === `${d.type}:`} disabled={!!busy} onClick={() => download(d.type)}>
                      Descarcă .docx
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
