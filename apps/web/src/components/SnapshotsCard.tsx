"use client";
import { useCallback, useEffect, useState } from "react";
import { RISK_LABELS, type RiskLevel } from "@togato/shared";
import { apiDownload, apiGet } from "@/lib/api";
import { Alert, Button, Card } from "@/components/ui";

interface Snapshot {
  id: string;
  version: number;
  reason: string;
  rulesetVersion: string;
  createdAt: string;
  createdByName: string;
  sha256: string;
  riskLevel: RiskLevel | "neclasificat";
}

const fmt = (iso: string) => new Date(iso).toLocaleString("ro-RO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Istoricul avizelor înghețate: fiecare aprobare salvează o copie imuabilă, exportabilă ca PDF. */
export function SnapshotsCard({ systemId, refreshKey }: { systemId: string; refreshKey?: unknown }) {
  const [rows, setRows] = useState<Snapshot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<{ data: Snapshot[] }>(`/api/ai-systems/${systemId}/snapshots`).then((r) => setRows(r.data)).catch((e) => setError(e.message));
  }, [systemId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function download(id: string) {
    setBusy(id); setError(null);
    try {
      await apiDownload(`/api/snapshots/${id}/pdf`, "aviz.pdf");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Avize aprobate</h2>
      <p className="mt-1 text-[12px] text-slate-500">La fiecare aprobare se salvează o copie imuabilă a analizei, cu versiunea legii și amprentă de integritate.</p>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      {rows && rows.length === 0 && <p className="mt-3 text-[12px] text-slate-400">Niciun aviz încă. Primul se creează la aprobarea încadrării.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink">
                  v{r.version} · {RISK_LABELS[r.riskLevel] ?? r.riskLevel}
                  {i === 0 && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">cel mai recent</span>}
                </div>
                <div className="truncate text-[11px] text-slate-500" title={`SHA-256 ${r.sha256}`}>{fmt(r.createdAt)} · {r.createdByName} · reguli {r.rulesetVersion}</div>
              </div>
              <Button size="sm" variant="secondary" loading={busy === r.id} disabled={!!busy} onClick={() => download(r.id)}>PDF</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
