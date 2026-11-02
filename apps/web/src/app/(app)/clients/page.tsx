"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClientSummary, RiskLevel } from "@togato/shared";
import { apiGet } from "@/lib/api";
import { Alert, Button, Card, EmptyState, LoadingBlock, PageHeader, ProgressBar, RiskBadge, inputClass } from "@/components/ui";
import { AddClientModal } from "./AddClientModal";

const ORDER: RiskLevel[] = ["interzis", "risc_ridicat", "transparenta", "minim"];

function ClientsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [rows, setRows] = useState<ClientSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(false);
  const [modal, setModal] = useState(params.get("nou") === "1");

  const load = useCallback(async (q: string, onlyMine: boolean) => {
    try {
      const qs = new URLSearchParams();
      if (q) qs.set("search", q);
      if (onlyMine) qs.set("mine", "1");
      const res = await apiGet<{ data: ClientSummary[] }>(`/api/clients${qs.toString() ? `?${qs.toString()}` : ""}`);
      setRows(res.data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search.trim(), mine), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, mine, load]);

  return (
    <div className="fade-up">
      <PageHeader title="Clienți" subtitle="Firmele pentru care cabinetul gestionează conformitatea AI Act." actions={<Button onClick={() => setModal(true)}>Adaugă client</Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input className={`${inputClass} sm:max-w-sm`} placeholder="Caută după nume sau CUI..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Caută clienți" />
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label="Filtru clienți">
          {[false, true].map((v) => (
            <button key={String(v)} onClick={() => setMine(v)} className={`px-3.5 py-2 text-[13px] font-medium transition ${mine === v ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {v ? "Clienții mei" : "Toți clienții"}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!rows ? <LoadingBlock /> : rows.length === 0 ? (
        <Card>
          {search ? <EmptyState title="Niciun rezultat" text={`Niciun client nu se potrivește cu „${search}”.`} />
            : mine ? <EmptyState title="Niciun client alocat ție" text="Clienții pe care îi adaugi sau care îți sunt alocați apar aici." />
            : <EmptyState title="Niciun client încă" text="Adaugă prima firmă-client după CUI." action={<Button onClick={() => setModal(true)}>Adaugă client</Button>} />}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_120px_160px] gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:grid">
            <div>Client</div><div>Sisteme AI</div><div>De verificat</div><div>Obligații</div>
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((c) => {
              const worst = ORDER.find((r) => c.riskCounts[r]);
              return (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="grid gap-2 px-5 py-3.5 hover:bg-slate-50 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_120px_160px] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-ink">{c.name}</div>
                      <div className="truncate text-[12px] text-slate-400">{[c.cui && `CUI ${c.cui}`, c.city, c.responsibleName && `responsabil ${c.responsibleName}`].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.systemsCount === 0 ? <span className="text-[12px] text-slate-400">Niciun sistem inventariat</span> : (
                        <>
                          <span className="text-[13px] font-medium text-slate-600">{c.systemsCount}</span>
                          {worst && <RiskBadge level={worst} />}
                        </>
                      )}
                    </div>
                    <div className="text-[13px]">{c.pendingReview > 0 ? <span className="font-semibold text-amber-700">{c.pendingReview}</span> : <span className="text-slate-400">—</span>}</div>
                    <div>{c.obligationsTotal > 0 ? <ProgressBar done={c.obligationsDone} total={c.obligationsTotal} /> : <span className="text-[12px] text-slate-400">—</span>}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <AddClientModal open={modal} onClose={() => { setModal(false); if (params.get("nou")) router.replace("/clients"); }} onCreated={(id) => router.push(`/clients/${id}`)} />
    </div>
  );
}

export default function ClientsPage() {
  return <Suspense fallback={<LoadingBlock />}><ClientsInner /></Suspense>;
}
