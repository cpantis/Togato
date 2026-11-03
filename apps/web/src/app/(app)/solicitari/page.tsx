"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SELF_VERDICT_LABELS, type Referral } from "@togato/shared";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Card, EmptyState, LoadingBlock, PageHeader, cn } from "@/components/ui";

const TABS = [["nou", "Noi"], ["acceptat", "Acceptate"], ["respins", "Refuzate"]] as const;

export default function ReferralsPage() {
  const [status, setStatus] = useState<(typeof TABS)[number][0]>("nou");
  const [rows, setRows] = useState<Referral[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    apiGet<{ data: Referral[] }>(`/api/referrals?status=${status}`).then((r) => setRows(r.data)).catch((e) => setError(e.message));
  }, [status]);

  return (
    <div className="fade-up">
      <PageHeader title="Solicitări de la firme" subtitle="Firme care și-au făcut autoevaluarea AI Act gratuit și v-au ales din directorul Togato. Profilul din director se setează în Setări." />
      <div className="mb-4 flex overflow-hidden rounded-lg border border-slate-200 bg-white sm:w-fit" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)} className={cn("flex-1 px-4 py-2 text-[13px] font-medium", status === k ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50")}>{label}</button>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      {!rows ? <LoadingBlock /> : rows.length === 0 ? (
        <Card><EmptyState title={status === "nou" ? "Nicio solicitare nouă" : "Nimic aici"} text="Când o firmă vă trimite autoevaluarea din director, o găsiți aici și primiți un email." action={<Link href="/settings#director" className="text-[13px] font-semibold text-brand hover:underline">Profilul cabinetului în director</Link>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/solicitari/${r.id}`} className="flex flex-col gap-1 px-5 py-3.5 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{r.company.name}</div>
                    <div className="truncate text-[12px] text-slate-500">{[r.company.county, r.contact.name, `${r.tools.length} ${r.tools.length === 1 ? "instrument" : "instrumente"}`].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.needsLawyer && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800">necesită avocat</span>}
                    {Array.from(new Set(r.tools.map((t) => t.result.verdict))).map((v) => <span key={v} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{SELF_VERDICT_LABELS[v]}</span>)}
                  </div>
                  <div className="text-[12px] text-slate-500 sm:w-28 sm:text-right">{formatDate(r.createdAt)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
