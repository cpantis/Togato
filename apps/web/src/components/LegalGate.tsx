"use client";
import { useState } from "react";
import Link from "next/link";
import { LEGAL_DOCUMENTS, LEGAL_VERSION } from "@togato/shared";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Button, Card } from "@/components/ui";

/** Termenii au fost actualizați: administratorul acceptă noua versiune; membrii sunt informați. */
export function LegalGate() {
  const { user, organization, refresh } = useAuth();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!organization || organization.legalCurrent !== false) return null;

  if (user?.role !== "admin") {
    return <div className="mb-5"><Alert kind="warning">Termenii Togato au fost actualizați. Până când un administrator al cabinetului acceptă noua versiune, puteți doar consulta datele.</Alert></div>;
  }
  async function accept() {
    setBusy(true); setError(null);
    try { await apiPost("/api/organization/legal/accept", { version: LEGAL_VERSION }); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card className="mb-5 border-amber-200 p-5">
      <h2 className="text-[15px] font-semibold text-ink">{organization.legalVersion && organization.legalVersion !== "initial" ? "Termenii Togato au fost actualizați" : "Acceptați termenii Togato"}</h2>
      <p className="mt-1 text-[13px] text-slate-600">Până la acceptare, datele pot fi doar consultate. Citiți documentele (versiunea {LEGAL_VERSION}):</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {LEGAL_DOCUMENTS.map((d) => <li key={d.code}><Link href={d.path} target="_blank" className="font-semibold text-brand hover:underline">{d.title}</Link></li>)}
      </ul>
      <label className="mt-3 flex items-start gap-2 text-[13px] text-slate-700">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        Accept documentele de mai sus în numele cabinetului {organization.name}.
      </label>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      <Button className="mt-3" size="sm" disabled={!checked} loading={busy} onClick={accept}>Accept</Button>
    </Card>
  );
}
