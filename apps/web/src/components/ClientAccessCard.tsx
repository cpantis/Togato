"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPut } from "@/lib/api";
import { Alert, Button, Card } from "@/components/ui";

interface AccessMember { userId: string; name: string; email: string; role: "admin" | "membru" | "colaborator"; granted: boolean; sees: boolean }

/** Accesul la client: restricționat (ziduri chinezești) și accesul explicit al membrilor / colaboratorilor. Doar administratori. */
export function ClientAccessCard({ clientId, onChange }: { clientId: string; onChange?: (restricted: boolean) => void }) {
  const [data, setData] = useState<{ restricted: boolean; members: AccessMember[] } | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () => apiGet<{ restricted: boolean; members: AccessMember[] }>(`/api/clients/${clientId}/access`).then((d) => {
    setData(d); setRestricted(d.restricted); setGranted(new Set(d.members.filter((m) => m.granted).map((m) => m.userId)));
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      await apiPut(`/api/clients/${clientId}/access`, { restricted, userIds: [...granted] });
      await load(); setSaved(true); onChange?.(restricted);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const toggle = (id: string) => setGranted((g) => { const n = new Set(g); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const others = data?.members.filter((m) => m.role !== "admin") ?? [];

  return (
    <Card className="h-fit p-5">
      <h2 className="text-[14px] font-semibold text-ink">Acces la client</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">Restricționat: doar administratorii, avocatul responsabil și colegii bifați văd clientul și dosarul lui (ex. la un conflict de interese în cabinet). Colaboratorii văd doar clienții la care sunt bifați.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {data && (
        <>
          <label className="mt-3 flex items-center gap-2 text-[13px] font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
            Acces restricționat
          </label>
          {others.length > 0 ? (
            <fieldset className="mt-3 space-y-1.5">
              <legend className="mb-1 text-[12px] font-semibold text-slate-600">Acces explicit</legend>
              {others.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 text-[13px] text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-brand" checked={granted.has(m.userId)} onChange={() => toggle(m.userId)} />
                  <span className="min-w-0 truncate">{m.name}{m.role === "colaborator" ? " · colaborator" : ""}</span>
                  {!m.sees && <span className="ml-auto shrink-0 text-[11px] text-slate-500">nu vede</span>}
                </label>
              ))}
            </fieldset>
          ) : <p className="mt-3 text-[12px] text-slate-500">Nu există alți membri în afara administratorilor.</p>}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="secondary" loading={busy} onClick={save}>Salvează accesul</Button>
            {saved && <span className="text-[12px] text-emerald-700" role="status">Salvat</span>}
          </div>
        </>
      )}
    </Card>
  );
}
