"use client";
import { useState } from "react";
import { JUDETE, type Organization } from "@togato/shared";
import { apiPut } from "@/lib/api";
import { Alert, Button, Card, Field, inputClass, textareaClass } from "@/components/ui";
import { Toggle } from "@/components/PoliciesCard";

/** Profilul cabinetului în directorul văzut de firmele care își fac autoevaluarea gratuită. */
export function DirectoryCard({ org, isAdmin, onChange }: { org: Organization; isAdmin: boolean; onChange: (o: Organization) => void }) {
  const d = org.directory ?? { listed: false, county: null, city: null, description: null, website: null, email: null };
  const [form, setForm] = useState({ listed: d.listed, county: d.county ?? "", city: d.city ?? "", description: d.description ?? "", website: d.website ?? "", email: d.email ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      onChange(await apiPut<Organization>("/api/organization/directory", { ...form, county: form.county || null }));
      setMsg({ kind: "info", text: form.listed ? "Cabinetul apare în director." : "Profilul a fost salvat; cabinetul nu apare în director." });
    } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); } finally { setBusy(false); }
  }

  return (
    <Card className="p-5">
      <form onSubmit={save}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">Directorul cabinetelor</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">Firmele care își fac gratuit autoevaluarea AI Act pe Togato pot alege un cabinet după județ sau nume și îi pot trimite dosarul gata completat. Solicitările apar în „Solicitări de la firme”.</p>
          </div>
          <Toggle label="Apare în director" checked={form.listed} disabled={!isAdmin} onChange={(v) => setForm({ ...form, listed: v })} />
        </div>
        <fieldset disabled={!isAdmin} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Județul">
            <select className={inputClass} value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })}>
              <option value="">—</option>
              {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </Field>
          <Field label="Localitatea"><input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Prezentare scurtă" hint="Maximum 600 de caractere: domenii, experiență în protecția datelor și tehnologie."><textarea className={textareaClass} rows={3} maxLength={600} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
          <Field label="Site (opțional)"><input className={inputClass} placeholder="https://" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></Field>
          <Field label="Email pentru solicitări (opțional)" hint="Implicit: administratorii cabinetului."><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        </fieldset>
        {msg && <div className="mt-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
        {isAdmin ? <div className="mt-3 flex justify-end"><Button type="submit" size="sm" loading={busy}>Salvează profilul</Button></div> : <p className="mt-3 text-[12px] text-slate-500">Doar un administrator poate modifica profilul.</p>}
      </form>
    </Card>
  );
}
