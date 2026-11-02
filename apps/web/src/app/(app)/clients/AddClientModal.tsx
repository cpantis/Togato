"use client";
import { useState } from "react";
import type { CompanyLookup } from "@togato/shared";
import { ApiError, apiPost } from "@/lib/api";
import { Alert, Button, Field, Modal, inputClass } from "@/components/ui";

const EMPTY = { cui: "", name: "", regCom: "", address: "", city: "", county: "", caen: "", caenDescription: "", employees: "", contactName: "", contactEmail: "" };

export function AddClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [lookup, setLookup] = useState<CompanyLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupInfo, setLookupInfo] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function close() {
    setForm(EMPTY); setLookup(null); setError(null); setLookupInfo(null);
    onClose();
  }

  async function doLookup() {
    if (!form.cui.trim()) return;
    setLooking(true); setError(null); setLookupInfo(null);
    try {
      const d = await apiPost<CompanyLookup>("/api/clients/lookup", { cui: form.cui });
      setLookup(d);
      setForm((f) => ({
        ...f,
        cui: d.cui,
        name: d.name || f.name,
        regCom: d.regCom || "",
        address: d.address || "",
        city: d.city || "",
        county: d.county || "",
        caen: d.caen || "",
        caenDescription: d.caenDescription || "",
        employees: d.employees !== null ? String(d.employees) : f.employees,
      }));
      setLookupInfo(d.active === false ? "Atenție: firma apare ca inactivă sau radiată." : `Date preluate de la ${d.source === "anaf" ? "ANAF" : "ListaFirme"}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLooking(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await apiPost<{ id: string }>("/api/clients", {
        cui: form.cui || null,
        name: form.name,
        regCom: form.regCom,
        address: form.address,
        city: form.city,
        county: form.county,
        caen: form.caen,
        caenDescription: form.caenDescription,
        employees: form.employees ? Number(form.employees) : null,
        turnover: lookup?.turnover ?? null,
        vatPayer: lookup?.vatPayer ?? null,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        sourceData: lookup ?? undefined,
      });
      close();
      onCreated(res.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.body?.clientId) {
        close();
        onCreated(err.body.clientId);
        return;
      }
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Client nou" wide>
      <form onSubmit={save} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="CUI" hint="Completăm automat datele de la ANAF">
              <input className={inputClass} inputMode="numeric" placeholder="ex. RO14399840" value={form.cui} onChange={set("cui")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } }} />
            </Field>
          </div>
          <Button type="button" variant="secondary" onClick={doLookup} loading={looking} disabled={!form.cui.trim()} className="mb-[22px]">Caută</Button>
        </div>
        {lookupInfo && <Alert kind={lookup?.active === false ? "warning" : "info"}>{lookupInfo}</Alert>}

        <Field label="Denumire">
          <input className={inputClass} required minLength={2} value={form.name} onChange={set("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nr. Reg. Com."><input className={inputClass} value={form.regCom} onChange={set("regCom")} /></Field>
          <Field label="Cod CAEN"><input className={inputClass} value={form.caen} onChange={set("caen")} /></Field>
          <Field label="Localitate"><input className={inputClass} value={form.city} onChange={set("city")} /></Field>
          <Field label="Județ"><input className={inputClass} value={form.county} onChange={set("county")} /></Field>
        </div>
        <Field label="Adresă"><input className={inputClass} value={form.address} onChange={set("address")} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nr. angajați"><input className={inputClass} type="number" min={0} value={form.employees} onChange={set("employees")} /></Field>
          <Field label="Persoană de contact"><input className={inputClass} value={form.contactName} onChange={set("contactName")} /></Field>
          <Field label="Email contact"><input className={inputClass} type="email" value={form.contactEmail} onChange={set("contactEmail")} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>Renunță</Button>
          <Button type="submit" loading={saving}>Salvează clientul</Button>
        </div>
      </form>
    </Modal>
  );
}
