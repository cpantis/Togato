"use client";
import { useState } from "react";
import type { Organization } from "@togato/shared";
import { apiPut } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Card, cn } from "@/components/ui";

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50", checked ? "bg-brand" : "bg-slate-300")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

/** Politicile cabinetului: analiza AI (consimțământ) și autentificarea în doi pași obligatorie. Doar administratori. */
export function PoliciesCard({ org, onChange }: { org: Organization; onChange: (o: Organization) => void }) {
  const { user, refresh } = useAuth();
  const isAdmin = user?.role === "admin";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(field: "aiEnabled" | "require2fa", value: boolean) {
    if (field === "aiEnabled" && value && !confirm("Activați analiza AI pentru tot cabinetul? Descrierea sistemelor și răspunsurile la chestionar vor fi trimise către Anthropic la fiecare memoriu generat.")) return;
    setBusy(field); setError(null);
    try {
      const o = await apiPut<Organization>("/api/organization", { name: org.name, [field]: value });
      onChange(o);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Confidențialitate și securitate</h2>
      {!isAdmin && <p className="mt-1 text-[12px] text-slate-500">Doar administratorii pot modifica aceste politici.</p>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}

      <div className="mt-4 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">Analiza AI (memoriul juridic)</div>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            La apăsarea butonului „Generează”, aplicația trimite către <b>Anthropic</b> (furnizorul modelului Claude): numele clientului și codul CAEN, descrierea sistemului AI, răspunsurile la chestionar și încadrarea propusă, plus pasaje din textul legii.
            Nu se trimit date de contact, documente sau alte informații. Potrivit condițiilor comerciale Anthropic, datele trimise prin API nu sunt folosite pentru antrenarea modelelor.
            Verificați compatibilitatea cu obligația de păstrare a secretului profesional și cu acordurile încheiate cu clienții înainte de activare.
          </p>
          {org.aiEnabled && org.aiEnabledAt && <p className="mt-1 text-[11px] text-slate-400">Activată la {new Date(org.aiEnabledAt).toLocaleDateString("ro-RO")}.</p>}
        </div>
        <Toggle label="Analiza AI" checked={org.aiEnabled} disabled={!isAdmin || busy === "aiEnabled"} onChange={(v) => save("aiEnabled", v)} />
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">Autentificare în doi pași obligatorie</div>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">Toți membrii cabinetului trebuie să folosească un cod din aplicația de autentificare. Cei care nu au activat-o sunt redirecționați la configurare înainte de a accesa datele clienților.</p>
          {!user?.totpEnabled && !org.require2fa && <p className="mt-1 text-[11px] text-amber-700">Activați întâi autentificarea în doi pași pentru propriul cont (mai jos).</p>}
        </div>
        <Toggle label="Autentificare în doi pași obligatorie" checked={org.require2fa} disabled={!isAdmin || busy === "require2fa" || (!org.require2fa && !user?.totpEnabled)} onChange={(v) => save("require2fa", v)} />
      </div>
    </Card>
  );
}
