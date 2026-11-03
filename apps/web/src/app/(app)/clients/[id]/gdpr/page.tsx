"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ClientDetail, ClientGdpr } from "@togato/shared";
import { apiGet } from "@/lib/api";
import { Alert, LoadingBlock, PageHeader, cn } from "@/components/ui";
import { ProcessingTab } from "@/components/gdpr/ProcessingTab";
import { DsarTab } from "@/components/gdpr/DsarTab";
import { BreachTab } from "@/components/gdpr/BreachTab";

const TABS = [["registru", "Registrul prelucrărilor"], ["cereri", "Cereri ale persoanelor"], ["incidente", "Incidente"]] as const;
type Tab = (typeof TABS)[number][0];

function GdprInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "registru") as Tab;
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [data, setData] = useState<ClientGdpr | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<ClientGdpr>(`/api/clients/${id}/gdpr`).then(setData).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    apiGet<ClientDetail>(`/api/clients/${id}`).then(setClient).catch((e) => setError(e.message));
    load();
  }, [id, load]);

  if (error) return <Alert>{error}</Alert>;
  if (!client || !data) return <LoadingBlock />;
  const counts: Record<Tab, number> = {
    registru: data.processing.length,
    cereri: data.dsars.filter((d) => d.status === "primita" || d.status === "in_lucru").length,
    incidente: data.breaches.filter((b) => !b.closedAt).length,
  };

  return (
    <div className="fade-up">
      <Link href={`/clients/${id}`} className="mb-3 inline-block text-[13px] text-slate-500 hover:text-brand">‹ {client.name}</Link>
      <PageHeader title="GDPR" subtitle={`${client.name} · Regulamentul (UE) 2016/679`} />
      <div className="mb-4 flex overflow-x-auto rounded-lg border border-slate-200 bg-white sm:w-fit" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => router.replace(`/clients/${id}/gdpr?tab=${k}`)}
            className={cn("whitespace-nowrap px-4 py-2 text-[13px] font-medium", tab === k ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50")}>
            {label}{counts[k] > 0 && <span className={cn("ml-1.5 rounded px-1.5 text-[11px]", tab === k ? "bg-white/20" : "bg-slate-100")}>{counts[k]}</span>}
          </button>
        ))}
      </div>
      {tab === "registru" && <ProcessingTab clientId={id} items={data.processing} systems={client.aiSystems} onChange={load} />}
      {tab === "cereri" && <DsarTab clientId={id} items={data.dsars} onChange={load} />}
      {tab === "incidente" && <BreachTab clientId={id} items={data.breaches} onChange={load} />}
    </div>
  );
}

export default function GdprPage() {
  return <Suspense fallback={<LoadingBlock />}><GdprInner /></Suspense>;
}
