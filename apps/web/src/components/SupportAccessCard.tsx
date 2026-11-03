"use client";
import { useState } from "react";
import type { Organization } from "@togato/shared";
import { apiDelete, apiPost } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card } from "@/components/ui";

/** Accesul de suport al echipei Togato: acordat explicit de un administrator, limitat în timp, retras oricând. */
export function SupportAccessCard({ org, isAdmin, onChange }: { org: Organization; isAdmin: boolean; onChange: (o: Organization) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = !!org.supportAccessUntil;

  async function grant(hours: 24 | 72 | 168) {
    if (!confirm(`Permiteți echipei Togato să vadă datele cabinetului (doar în citire) timp de ${hours / 24} ${hours === 24 ? "zi" : "zile"}? Fiecare consultare va apărea în jurnalul cabinetului.`)) return;
    setBusy(true); setError(null);
    try { onChange(await apiPost<Organization>("/api/organization/support-access", { hours })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true); setError(null);
    try { onChange(await apiDelete<Organization>("/api/organization/support-access")); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Acces pentru echipa de suport Togato</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">Implicit, echipa Togato nu vede datele clienților cabinetului. Dacă ne cereți ajutorul, puteți acorda acces temporar, doar în citire. Fiecare consultare apare în jurnalul de activitate.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {active ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-800">Acces acordat până la {formatDate(org.supportAccessUntil!)}</span>
          {isAdmin && <Button size="sm" variant="secondary" loading={busy} onClick={revoke}>Retrage accesul</Button>}
        </div>
      ) : isAdmin ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => grant(24)}>Acordă 24 de ore</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => grant(72)}>3 zile</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => grant(168)}>7 zile</Button>
        </div>
      ) : <p className="mt-3 text-[12px] text-slate-500">Doar un administrator poate acorda accesul.</p>}
    </Card>
  );
}
