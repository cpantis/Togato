"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardData, RiskLevel } from "@togato/shared";
import { RISK_LABELS } from "@togato/shared";
import { apiGet } from "@/lib/api";
import { daysUntil, formatDate } from "@/lib/format";
import { Alert, Button, Card, EmptyState, LoadingBlock, PageHeader, RiskBadge } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

const RISK_ORDER: (RiskLevel | "neclasificat")[] = ["interzis", "risc_ridicat", "transparenta", "minim", "neaplicabil"];
const RISK_BAR: Record<string, string> = { interzis: "bg-red-500", risc_ridicat: "bg-orange-500", transparenta: "bg-sky-500", minim: "bg-emerald-500", neaplicabil: "bg-slate-300", neclasificat: "bg-slate-300" };

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[12px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-[26px] font-bold tabular-nums tracking-tight text-ink">{value}</div>
      {hint && <div className="text-[12px] text-slate-400">{hint}</div>}
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiGet<DashboardData>("/api/dashboard").then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingBlock />;

  const firstName = user?.name.split(" ")[0];
  const totalObl = data.obligationsOpen + data.obligationsDone;

  return (
    <div className="fade-up">
      <PageHeader title={`Bună, ${firstName}`} subtitle="Situația conformității AI Act pentru clienții cabinetului." actions={<Link href="/clients?nou=1"><Button>Adaugă client</Button></Link>} />

      {data.clients === 0 ? (
        <Card>
          <EmptyState title="Începe cu primul client" text="Adaugă o firmă-client după CUI, apoi inventariază sistemele AI pe care le folosește. Togato propune încadrarea și obligațiile." action={<Link href="/clients?nou=1"><Button>Adaugă primul client</Button></Link>} />
        </Card>
      ) : (
        <>
          {data.lawUpdate.systems > 0 && (
            <Link href="/legislation" className="mb-5 flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 transition hover:border-amber-300 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-amber-900">Legislația s-a actualizat: {data.lawUpdate.title}</div>
                <div className="text-[13px] text-amber-800">
                  {data.lawUpdate.systems === 1 ? "Un sistem" : `${data.lawUpdate.systems} sisteme`} la {data.lawUpdate.clients === 1 ? "un client" : `${data.lawUpdate.clients} clienți`} {data.lawUpdate.systems === 1 ? "a fost reîncadrat și trebuie verificat" : "au fost reîncadrate și trebuie verificate"}.
                </div>
              </div>
              <span className="text-[13px] font-semibold text-amber-900">Vezi ce s-a schimbat ›</span>
            </Link>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Clienți" value={data.clients} />
            <Stat label="Sisteme AI inventariate" value={data.systems} />
            <Stat label="De verificat de avocat" value={data.pendingReview} hint="încadrări propuse" />
            <Stat label="Obligații îndeplinite" value={totalObl ? `${Math.round((data.obligationsDone / totalObl) * 100)}%` : "—"} hint={`${data.obligationsDone} din ${totalObl}`} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="text-[14px] font-semibold text-ink">Necesită atenție</h2>
              {data.attention.length === 0 ? (
                <p className="mt-3 text-[13px] text-slate-500">Toate încadrările sunt verificate. Nimic urgent.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {data.attention.map((a) => (
                    <li key={a.systemId}>
                      <Link href={`/systems/${a.systemId}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                        <RiskBadge level={a.riskLevel} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-ink">{a.systemName} <span className="font-normal text-slate-400">· {a.clientName}</span></div>
                          <div className="truncate text-[12px] text-slate-500">{a.reason}</div>
                        </div>
                        <span className="text-slate-300">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-5">
              <Card className="p-5">
                <h2 className="text-[14px] font-semibold text-ink">Sisteme pe niveluri de risc</h2>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
                  {RISK_ORDER.map((r) => (data.riskCounts[r] ? <div key={r} className={RISK_BAR[r]} style={{ width: `${(data.riskCounts[r]! / Math.max(data.systems, 1)) * 100}%` }} /> : null))}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {RISK_ORDER.map((r) => (
                    <li key={r} className="flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-2 text-slate-600"><span className={`h-2 w-2 rounded-full ${RISK_BAR[r]}`} />{RISK_LABELS[r]}</span>
                      <span className="font-semibold tabular-nums text-ink">{data.riskCounts[r] || 0}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-5">
                <h2 className="text-[14px] font-semibold text-ink">Termene AI Act</h2>
                <ul className="mt-3 space-y-3">
                  {data.upcoming.map((m) => {
                    const days = daysUntil(m.date);
                    return (
                      <li key={m.date} className="text-[13px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-ink">{m.label}</span>
                          <span className={days < 0 ? "text-red-600" : "text-slate-500"}>{days < 0 ? "în vigoare" : `în ${days} zile`}</span>
                        </div>
                        <div className="text-[12px] text-slate-400">{formatDate(m.date)} · {m.obligationsOpen === 1 ? "o obligație deschisă" : `${m.obligationsOpen} obligații deschise`}</div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
