"use client";
import { useEffect, useState } from "react";
import type { Organization } from "@togato/shared";
import { apiGet, apiPut } from "@/lib/api";
import { DEFAULT_BRAND, softOf, textOn } from "@/lib/brand";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Button, Card, Field, LoadingBlock, PageHeader, inputClass } from "@/components/ui";
import { PoliciesCard } from "@/components/PoliciesCard";
import { TwoFactorCard } from "@/components/TwoFactorCard";

const PRESETS = ["#7a1f3a", "#1e3a8a", "#0f766e", "#334155", "#9a3412", "#4c1d95"];

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const isAdmin = user?.role === "admin";
  const [org, setOrg] = useState<Organization | null>(null);
  const [form, setForm] = useState({ name: "", brandColor: DEFAULT_BRAND, logoUrl: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    apiGet<Organization>("/api/organization").then((o) => {
      setOrg(o);
      setForm({ name: o.name, brandColor: o.brandColor || DEFAULT_BRAND, logoUrl: o.logoUrl || "" });
    }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => setLogoOk(true), [form.logoUrl]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const o = await apiPut<Organization>("/api/organization", form);
      setOrg(o);
      setSaved(true);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!org) return error ? <Alert>{error}</Alert> : <LoadingBlock />;
  const color = /^#[0-9a-f]{6}$/i.test(form.brandColor) ? form.brandColor : DEFAULT_BRAND;

  return (
    <div className="fade-up">
      <PageHeader title="Setări cabinet" subtitle="Identitatea vizuală, confidențialitatea și securitatea contului." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5">
          <form onSubmit={save} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            {saved && <Alert kind="info">Setările au fost salvate.</Alert>}
            {!isAdmin && <Alert kind="warning">Doar administratorii cabinetului pot modifica setările.</Alert>}
            <fieldset disabled={!isAdmin} className="space-y-4">
              <Field label="Numele cabinetului"><input className={inputClass} required minLength={2} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
              <Field label="Culoarea cabinetului" hint="Folosită în antetul și butoanele portalului.">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="color" value={color} onChange={(e) => setForm((f) => ({ ...f, brandColor: e.target.value }))} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" aria-label="Alege culoarea" />
                  <input className={`${inputClass} w-32 font-mono`} value={form.brandColor} onChange={(e) => setForm((f) => ({ ...f, brandColor: e.target.value }))} aria-label="Cod culoare" />
                  {PRESETS.map((p) => (
                    <button key={p} type="button" onClick={() => setForm((f) => ({ ...f, brandColor: p }))} className="h-7 w-7 rounded-full border-2 border-white shadow ring-1 ring-slate-200" style={{ background: p }} aria-label={`Culoarea ${p}`} />
                  ))}
                </div>
              </Field>
              <Field label="Adresa logo-ului (opțional)" hint="Un link https:// către o imagine PNG sau SVG, de preferat pătrată.">
                <input className={inputClass} placeholder="https://cabinet.ro/logo.png" value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} />
              </Field>
              <div className="flex justify-end"><Button type="submit" loading={saving}>Salvează</Button></div>
            </fieldset>
          </form>
        </Card>

        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Previzualizare portal</div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#f6f7f9]">
            <div className="flex items-center gap-3 px-4 py-4" style={{ background: color, color: textOn(color) }}>
              {form.logoUrl && logoOk ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoUrl} alt="" onError={() => setLogoOk(false)} className="h-9 w-9 rounded-lg bg-white object-contain p-1" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-bold" style={{ background: softOf(textOn(color), 0.18) }}>
                  {(form.name || "C").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold">{form.name || "Cabinet"}</div>
                <div className="truncate text-[12px] opacity-80">Inventarul instrumentelor AI · Client SRL</div>
              </div>
            </div>
            <div className="p-4">
              <div className="rounded-lg bg-white p-4">
                <div className="text-[14px] font-semibold text-ink">Ce instrumente AI folosește firma?</div>
                <div className="mt-1 text-[12px] text-slate-500">Adăugați câte un instrument pe rând...</div>
                <div className="mt-3 inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold" style={{ background: color, color: textOn(color) }}>+ Adaugă un instrument AI</div>
              </div>
            </div>
          </div>
          {form.logoUrl && !logoOk && <p className="mt-2 text-[12px] text-red-600">Imaginea logo-ului nu se poate încărca de la această adresă.</p>}
        </div>
      </div>

      <h2 id="securitate" className="mb-3 mt-8 text-[15px] font-semibold text-ink">Securitate</h2>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PoliciesCard org={org} onChange={setOrg} />
        <TwoFactorCard />
      </div>
    </div>
  );
}
