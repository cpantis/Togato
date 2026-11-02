"use client";
import { useCallback, useEffect, useState } from "react";
import type { PortalLinkStatus } from "@togato/shared";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, Modal, cn, inputClass } from "@/components/ui";

export function PortalCard({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [status, setStatus] = useState<PortalLinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    apiGet<PortalLinkStatus>(`/api/clients/${clientId}/portal`).then(setStatus).catch((e) => setError(e.message));
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    if (status?.active && !confirm("Generezi un link nou? Linkul trimis anterior clientului nu va mai funcționa.")) return;
    setBusy(true); setError(null);
    try {
      const res = await apiPost<{ url: string }>(`/api/clients/${clientId}/portal`);
      setLink(res.url); setCopied(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm("Dezactivezi portalul? Clientul nu va mai putea adăuga instrumente cu linkul primit.")) return;
    setBusy(true);
    try {
      await apiDelete(`/api/clients/${clientId}/portal`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-ink">Portalul clientului</h2>
        {status && (
          <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", status.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
            {status.active ? "Activ" : status.expired ? "Expirat" : "Inactiv"}
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] text-slate-500">Clientul își adaugă singur instrumentele AI, fără cont, printr-un link personal.</p>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      {status?.active && (
        <p className="mt-2 text-[12px] text-slate-500">
          Valabil până la {formatDate(status.expiresAt)}.{" "}
          {status.lastUsedAt ? <>Ultima vizită: {formatDate(status.lastUsedAt)}.</> : <>Clientul nu l-a deschis încă.</>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant={status?.active ? "secondary" : "primary"} onClick={generate} loading={busy}>{status?.active ? "Link nou" : "Generează link"}</Button>
        {status?.active && <Button size="sm" variant="ghost" onClick={revoke} disabled={busy}>Dezactivează</Button>}
      </div>

      <Modal open={!!link} onClose={() => setLink(null)} title="Link pentru portalul clientului">
        <div className="space-y-4">
          <Alert kind="info">Trimite linkul persoanei de contact de la <b>{clientName}</b>. E valabil 90 de zile; oricine are linkul poate adăuga instrumente pentru acest client.</Alert>
          <div className="flex gap-2">
            <input className={cn(inputClass, "font-mono text-[12px]")} readOnly value={link || ""} onFocus={(e) => e.target.select()} aria-label="Link portal" />
            <Button type="button" variant="secondary" onClick={copy}>{copied ? "Copiat" : "Copiază"}</Button>
          </div>
          <p className="text-[12px] text-slate-500">Linkul nu se mai poate afișa după ce închizi fereastra. Dacă îl pierzi, generează unul nou.</p>
          <div className="flex justify-end"><Button onClick={() => setLink(null)}>Gata</Button></div>
        </div>
      </Modal>
    </Card>
  );
}
