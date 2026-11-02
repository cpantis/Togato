"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { LegislationData } from "@togato/shared";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Card, LoadingBlock, PageHeader, RiskBadge } from "@/components/ui";

export default function LegislationPage() {
  const [data, setData] = useState<LegislationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<LegislationData>("/api/legislation").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingBlock />;

  return (
    <div className="fade-up">
      <PageHeader title="Noutăți legislative" subtitle={`Regulile AI Act folosite de Togato — versiunea ${data.current}.`} />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-ink">Sisteme reîncadrate, de verificat</h2>
          <p className="text-[12px] text-slate-500">După o modificare de fond a legii, încadrarea propusă se recalculează automat. Stările și notele obligațiilor se păstrează; decizia rămâne la avocat.</p>
        </div>
        {data.affected.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-slate-500">Nimic de verificat. Toate sistemele sunt încadrate după regulile în vigoare.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.affected.map((a) => (
              <li key={a.id}>
                <Link href={`/systems/${a.id}`} className="block px-5 py-3.5 hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{a.name}</span>
                    <span className="text-[13px] text-slate-400">· {a.clientName}</span>
                    <RiskBadge level={a.riskLevel} />
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{a.note}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 mt-8 text-[14px] font-semibold text-ink">Istoricul versiunilor</h2>
      <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
        {data.changelog.map((c, i) => (
          <li key={c.version} className="relative">
            <span className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${i === 0 ? "bg-brand" : "bg-slate-300"}`} />
            <Card className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-600">{c.version}</span>
                <span className="text-[14px] font-semibold text-ink">{c.title}</span>
                {i === 0 && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">în vigoare</span>}
                <span className="ml-auto text-[12px] text-slate-400">{formatDate(c.date)}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{c.summary}</p>
              <p className="mt-2 text-[12px] text-slate-500"><b className="font-semibold">Sursa:</b> {c.source}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.articles.map((a) => <span key={a} className="rounded bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{a}</span>)}
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
