"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPut } from "@/lib/api";
import { Alert, Card } from "@/components/ui";
import { Toggle } from "@/components/PoliciesCard";

type Prefs = { notifyDeadlines: boolean; notifyPortal: boolean };

const ITEMS: { key: keyof Prefs; title: string; text: string }[] = [
  { key: "notifyDeadlines", title: "Rezumatul zilnic al termenelor", text: "Dimineața, lista obligațiilor cu termen intern în următoarele 7 zile sau depășit, pentru clienții de care răspundeți (sau, pentru clienții fără responsabil, pentru administratori). Doar în zilele cu termene." },
  { key: "notifyPortal", title: "Trimiteri din portalul clientului", text: "Când un client adaugă un instrument AI prin portal." },
];

/** Preferințele de email ale utilizatorului curent. */
export function NotificationsCard() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<keyof Prefs | null>(null);

  useEffect(() => { apiGet<Prefs>("/api/account/notifications").then(setPrefs).catch((e) => setError(e.message)); }, []);

  async function save(key: keyof Prefs, value: boolean) {
    setBusy(key); setError(null);
    try { setPrefs(await apiPut<Prefs>("/api/account/notifications", { [key]: value })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Notificări pe email</h2>
      <p className="mt-1 text-[12px] text-slate-500">Se aplică doar contului dumneavoastră.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {prefs && ITEMS.map((it, i) => (
        <div key={it.key} className={`mt-4 flex items-start justify-between gap-4 ${i < ITEMS.length - 1 ? "border-b border-slate-100 pb-4" : ""}`}>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">{it.title}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{it.text}</p>
          </div>
          <Toggle label={it.title} checked={prefs[it.key]} disabled={busy === it.key} onChange={(v) => save(it.key, v)} />
        </div>
      ))}
    </Card>
  );
}
