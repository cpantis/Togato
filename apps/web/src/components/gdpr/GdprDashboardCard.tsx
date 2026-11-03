"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DSAR_TYPES, daysBetween, type GdprOverview } from "@togato/shared";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { Pill, remaining } from "./common";

/** Panou: incidentele încă nenotificate și cererile persoanelor vizate cu termen apropiat. */
export function GdprDashboardCard() {
  const [data, setData] = useState<GdprOverview | null>(null);
  useEffect(() => { apiGet<GdprOverview>("/api/gdpr/overview").then(setData).catch(() => setData({ dsars: [], breaches: [] })); }, []);
  if (!data) return null;
  const urgent = data.breaches.filter((b) => b.duties.notifyAuthority && !b.authorityNotifiedAt);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">GDPR: termene</h2>
      {!urgent.length && !data.dsars.length ? (
        <p className="mt-2 text-[13px] text-slate-500">Nicio cerere deschisă și niciun incident nenotificat.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {urgent.map((b) => {
            const r = remaining(b.deadline);
            return (
              <li key={b.id} className="text-[13px]">
                <Link href={`/clients/${b.clientId}/gdpr?tab=incidente`} className="flex items-center justify-between gap-2 hover:underline">
                  <span className="truncate font-medium text-ink">Incident: {b.title}</span>
                  <Pill tone={r.overdue ? "red" : "amber"}>{r.text}</Pill>
                </Link>
                <div className="text-[12px] text-slate-500">{b.clientName} · notificare ANSPDCP</div>
              </li>
            );
          })}
          {data.dsars.slice(0, 6).map((d) => {
            const left = daysBetween(today, d.dueOn);
            return (
              <li key={d.id} className="text-[13px]">
                <Link href={`/clients/${d.clientId}/gdpr?tab=cereri`} className="flex items-center justify-between gap-2 hover:underline">
                  <span className="truncate font-medium text-ink">{DSAR_TYPES.find((t) => t.code === d.type)?.label} — {d.requesterName}</span>
                  <Pill tone={left < 0 ? "red" : left <= 7 ? "amber" : "slate"}>{left < 0 ? `depășit ${-left} z` : `${left} zile`}</Pill>
                </Link>
                <div className="text-[12px] text-slate-500">{d.clientName} · termen {formatDate(d.dueOn)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
