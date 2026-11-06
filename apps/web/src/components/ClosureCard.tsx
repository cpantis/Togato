"use client";
import { useState } from "react";
import type { Organization } from "@togato/shared";
import { apiDelete, apiDownload, apiPost, apiPut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";

const RETENTION = [
  { v: "", label: "Păstrare nelimitată (implicit)" },
  { v: "1", label: "1 an de la arhivare" },
  { v: "2", label: "2 ani de la arhivare" },
  { v: "3", label: "3 ani de la arhivare" },
  { v: "5", label: "5 ani de la arhivare" },
  { v: "10", label: "10 ani de la arhivare" },
];

/** Politica de păstrare a dosarelor arhivate. */
export function RetentionCard({ org, isAdmin, onChange }: { org: Organization; isAdmin: boolean; onChange: (o: Organization) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(v: string) {
    const years = v ? Number(v) : null;
    if (years && !confirm(`Dosarele clienților arhivați de mai mult de ${years} ${years === 1 ? "an" : "ani"} vor fi șterse definitiv (cu anunț pe email cu 30 de zile înainte). Continuați?`)) return;
    setBusy(true); setError(null);
    try { onChange(await apiPut<Organization>("/api/organization/retention", { years })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Păstrarea dosarelor arhivate</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">După termenul ales, dosarul unui client arhivat (avize, dovezi, documente) se șterge definitiv. Administratorii primesc un email cu 30 de zile înainte; reactivarea clientului oprește ștergerea. Stabiliți termenul conform obligațiilor de arhivare ale cabinetului.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-3">
        <Field label="Termen de păstrare">
          <select className={inputClass} disabled={!isAdmin || busy} value={org.archivedRetentionYears ? String(org.archivedRetentionYears) : ""} onChange={(e) => save(e.target.value)}>
            {RETENTION.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
        </Field>
      </div>
    </Card>
  );
}

/** Exportul complet și închiderea contului cabinetului. */
export function ClosureCard({ org, isAdmin, onChange }: { org: Organization; isAdmin: boolean; onChange: (o: Organization) => void }) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState<"export" | "close" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [open, setOpen] = useState(false);

  async function run(kind: "export" | "close" | "cancel", fn: () => Promise<void>) {
    setBusy(kind); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  const exportAll = () => run("export", () => apiDownload("/api/organization/export", "togato-export.zip"));
  const close = () => run("close", async () => { onChange(await apiPost<Organization>("/api/organization/closure", { confirm: confirmName.trim() })); setOpen(false); await refresh(); });
  const cancel = () => run("cancel", async () => { onChange(await apiDelete<Organization>("/api/organization/closure")); await refresh(); });

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Export complet și închiderea contului</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">Exportul conține dosarul fiecărui client (inclusiv arhivați), echipa și jurnalul de activitate. La închidere, datele se șterg definitiv după 30 de zile; până atunci pot fi consultate și exportate, iar închiderea poate fi anulată.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {!isAdmin ? <p className="mt-3 text-[12px] text-slate-500">Doar un administrator poate exporta sau închide contul.</p> : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={busy === "export"} disabled={!!busy} onClick={exportAll}>Exportă toate datele (ZIP)</Button>
            {org.closureScheduledFor
              ? <Button size="sm" loading={busy === "cancel"} disabled={!!busy} onClick={cancel}>Anulează închiderea</Button>
              : !open && <Button size="sm" variant="danger" disabled={!!busy} onClick={() => setOpen(true)}>Închide contul…</Button>}
          </div>
          {org.closureScheduledFor && <div className="mt-3"><Alert kind="warning">Închiderea e programată: datele cabinetului se șterg definitiv la {formatDate(org.closureScheduledFor)}.</Alert></div>}
          {open && !org.closureScheduledFor && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50/50 p-4">
              <p className="text-[12px] leading-relaxed text-slate-700">Exportați datele înainte. Dacă aveți un abonament activ, anulați-l mai întâi din secțiunea Abonament. Scrieți numele cabinetului pentru confirmare:</p>
              <div className="mt-2"><Field label="Numele cabinetului"><input className={inputClass} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={org.name} /></Field></div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" loading={busy === "close"} disabled={!!busy || confirmName.trim() !== org.name} onClick={close}>Programează închiderea</Button>
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setOpen(false)}>Renunță</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
