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
  const [modal, setModal] = useState(params.get("nou") === "1");

  const load = useCallback(async (q: string) => {
    try {
      const res = await apiGet<{ data: ClientSummary[] }>(`/api/clients${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      setRows(res.data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <div className="fade-up">
      <PageHeader title="Clienți" subtitle="Firmele pentru care cabinetul gestionează conformitatea AI Act." actions={<Button onClick={() => setModal(true)}>Adaugă client</Button>} />
      <div className="mb-4 max-w-sm">
        <input className={inputClass} placeholder="Caută după nume sau CUI..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Caută clienți" />
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!rows ? <LoadingBlock /> : rows.length === 0 ? (
        <Card>
          {search ? <EmptyState title="Niciun rezultat" text={`Niciun client nu se potrivește cu „${search}”.`} />
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
                      <div className="truncate text-[12px] text-slate-400">{[c.cui && `CUI ${c.cui}`, c.city, c.caen && `CAEN ${c.caen}`].filter(Boolean).join(" · ") || "—"}</div>
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
