"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ClientGdpr } from "@togato/shared";
import { apiGet } from "@/lib/api";
import { Card } from "@/components/ui";
import { Pill } from "./common";

/** Rezumatul GDPR pe pagina clientului, cu legături către cele trei registre. */
export function GdprClientCard({ clientId }: { clientId: string }) {
  const [d, setD] = useState<ClientGdpr | null>(null);
  useEffect(() => { apiGet<ClientGdpr>(`/api/clients/${clientId}/gdpr`).then(setD).catch(() => undefined); }, [clientId]);
  const incomplete = d?.processing.filter((a) => a.check.issues.length).length ?? 0;
  const openDsar = d?.dsars.filter((x) => x.status === "primita" || x.status === "in_lucru") ?? [];
  const openBreach = d?.breaches.filter((b) => !b.closedAt) ?? [];
  const rows: [string, string, React.ReactNode][] = d ? [
    ["registru", "Registrul prelucrărilor", d.processing.length ? <>{d.processing.length} activități{incomplete > 0 && <> · <Pill tone="amber">{incomplete} de completat</Pill></>}</> : <span className="text-slate-500">gol</span>],
    ["cereri", "Cereri ale persoanelor", openDsar.length ? <>{openDsar.length} deschise{openDsar.some((x) => x.overdue) && <> · <Pill tone="red">termen depășit</Pill></>}</> : <span className="text-slate-500">niciuna deschisă</span>],
    ["incidente", "Incidente de securitate", openBreach.length ? <>{openBreach.length} deschise{openBreach.some((b) => b.authorityOverdue) && <> · <Pill tone="red">72 h depășite</Pill></>}</> : <span className="text-slate-500">niciunul deschis</span>],
  ] : [];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-ink">GDPR</h2>
        <Link href={`/clients/${clientId}/gdpr`} className="text-[12px] font-semibold text-brand hover:underline">Deschide ›</Link>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map(([tab, label, value]) => (
          <li key={tab}>
            <Link href={`/clients/${clientId}/gdpr?tab=${tab}`} className="block rounded-md px-2 py-1.5 hover:bg-slate-50">
              <div className="text-[13px] font-medium text-ink">{label}</div>
              <div className="text-[12px] text-slate-600">{value}</div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
