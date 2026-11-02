"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ClientDetail, Obligation, TeamData } from "@togato/shared";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { Alert, Button, Card, EmptyState, LoadingBlock, PageHeader, ProgressBar, ReviewBadge, RiskBadge } from "@/components/ui";
import { ObligationList } from "@/components/ObligationList";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [team, setTeam] = useState<TeamData["members"]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    apiGet<TeamData>("/api/team").then((d) => setTeam(d.members)).catch(() => setTeam([]));
  }, []);

  async function assign(userId: string) {
    setAssigning(true);
    try {
      await apiPatch(`/api/clients/${id}/responsible`, { userId: userId || null });
      const m = team.find((t) => t.id === userId);
      setClient((c) => c && { ...c, responsibleUserId: userId || null, responsibleName: m?.name ?? null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAssigning(false);
    }
  }

  const load = useCallback(() => {
    apiGet<ClientDetail>(`/api/clients/${id}`).then(setClient).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function remove() {
    if (!client || !confirm(`Ștergi clientul „${client.name}” împreună cu inventarul AI și obligațiile? Acțiunea nu poate fi anulată.`)) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/clients/${id}`);
      router.replace("/clients");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!client) return <LoadingBlock />;

  const updateObligation = (o: Obligation) => setClient((c) => c && { ...c, clientObligations: c.clientObligations.map((x) => (x.id === o.id ? o : x)) });
  const info = [
    client.cui && ["CUI", client.cui],
    client.regCom && ["Reg. Com.", client.regCom],
    client.caen && ["CAEN", `${client.caen}${client.caenDescription ? ` — ${client.caenDescription}` : ""}`],
    client.employees !== null && ["Angajați", formatNumber(client.employees)],
    (client.city || client.county) && ["Sediu", [client.city, client.county].filter(Boolean).join(", ")],
    client.contactName && ["Contact", `${client.contactName}${client.contactEmail ? ` · ${client.contactEmail}` : ""}`],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="fade-up">
      <Link href="/clients" className="mb-3 inline-block text-[13px] text-slate-500 hover:text-brand">‹ Clienți</Link>
      <PageHeader
        title={client.name}
        subtitle={info.length ? info.map(([k, v]) => `${k} ${v}`).slice(0, 3).join(" · ") : undefined}
        actions={<>
          <Button variant="danger" size="sm" onClick={remove} loading={deleting}>Șterge clientul</Button>
          <Link href={`/clients/${id}/systems/new`}><Button>Adaugă sistem AI</Button></Link>
        </>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-ink">Inventar AI</h2>
              <span className="text-[12px] text-slate-400">{client.aiSystems.length} sisteme</span>
            </div>
            {client.aiSystems.length === 0 ? (
              <EmptyState title="Niciun sistem inventariat" text="Adaugă fiecare instrument AI folosit de client: ChatGPT, Copilot, un chatbot pe site, un modul de HR cu AI..." action={<Link href={`/clients/${id}/systems/new`}><Button>Adaugă primul sistem</Button></Link>} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {client.aiSystems.map((s) => (
                  <li key={s.id}>
                    <Link href={`/systems/${s.id}`} className="flex flex-col gap-2 px-5 py-3.5 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-ink">{s.name}</div>
                        <div className="truncate text-[12px] text-slate-400">{[s.vendor, s.department, s.purpose].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <RiskBadge level={s.riskLevel} />
                        <ReviewBadge status={s.reviewStatus} />
                      </div>
                      <div className="w-36 shrink-0"><ProgressBar done={s.obligationsDone ?? 0} total={s.obligationsTotal ?? 0} /></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {client.clientObligations.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3.5">
                <h2 className="text-[14px] font-semibold text-ink">Obligații generale ale firmei</h2>
                <p className="text-[12px] text-slate-500">Se aplică o singură dată, indiferent de numărul de sisteme.</p>
              </div>
              <ObligationList items={client.clientObligations} onChange={updateObligation} />
            </Card>
          )}
        </div>

        <Card className="h-fit p-5">
          <h2 className="text-[14px] font-semibold text-ink">Avocat responsabil</h2>
          <select
            className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px]"
            value={client.responsibleUserId ?? ""}
            disabled={assigning}
            onChange={(e) => assign(e.target.value)}
            aria-label="Avocat responsabil"
          >
            <option value="">Nealocat</option>
            {team.filter((m) => m.status === "activ" || m.id === client.responsibleUserId).map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.status !== "activ" ? " (dezactivat)" : ""}</option>
            ))}
          </select>
          <h2 className="mt-5 text-[14px] font-semibold text-ink">Date firmă</h2>
          <dl className="mt-3 space-y-2.5">
            {info.length === 0 && <div className="text-[13px] text-slate-400">Fără date suplimentare.</div>}
            {info.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-[13px] text-slate-700">{v}</dd>
              </div>
            ))}
            {client.address && (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Adresă</dt>
                <dd className="text-[13px] text-slate-700">{client.address}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </div>
  );
}
