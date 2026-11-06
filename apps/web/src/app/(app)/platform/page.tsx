"use client";
import { useCallback, useEffect, useState } from "react";
import { BILLING_STATE_LABELS, PLANS, type BillingState } from "@togato/shared";
import { apiGet, apiPost } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Button, Card, LoadingBlock, Modal, PageHeader, RiskBadge, cn, inputClass } from "@/components/ui";
import { SystemStatusCard } from "@/components/SystemStatusCard";

type OrgRow = {
  id: string; name: string; plan: string; status: string; billingState: BillingState; trialEndsAt: string | null; subscriptionStatus: string | null;
  createdAt: string; users: number; clients: number; systems: number; lastActiveAt: string | null; suspendedReason: string | null;
  supportAccess: boolean; supportAccessUntil: string | null;
};
type Support = {
  organization: { name: string; supportAccessUntil: string };
  members: { id: string; name: string; email: string; role: string; status: string; totpEnabled: boolean; lastActiveAt: string | null }[];
  clients: { id: string; name: string; cui: string | null; archivedAt: string | null; systems: number }[];
  systems: { id: string; clientId: string; name: string; riskLevel: any; reviewStatus: string; rulesetVersion: string; aiMemoStatus: string | null; aiMemoError: string | null }[];
  activity: { at: string; action: string; entity: string; user: string | null }[];
};
type AuditRow = { id: string; actorEmail: string; action: string; organizationName: string | null; details: unknown; createdAt: string };

const STATE_STYLE: Record<BillingState, string> = {
  proba: "bg-sky-50 text-sky-800", activ: "bg-emerald-50 text-emerald-800", restant: "bg-amber-50 text-amber-800",
  expirat: "bg-red-50 text-red-800", suspendat: "bg-red-100 text-red-800",
};

/** Consola echipei Togato: cabinetele, starea lor și accesul de suport (doar cu acordul cabinetului). */
export default function PlatformPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState<Support | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const r = await apiGet<{ data: OrgRow[]; total: number }>(`/api/platform/organizations?limit=100${q ? `&search=${encodeURIComponent(q)}` : ""}`);
      setRows(r.data); setTotal(r.total); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { const t = setTimeout(() => load(search.trim()), search ? 250 : 0); return () => clearTimeout(t); }, [search, load]);

  async function act(org: OrgRow, action: "suspend" | "unsuspend" | "trial" | "plan" | "support") {
    setError(null);
    try {
      if (action === "suspend") {
        const reason = prompt(`Motivul suspendării cabinetului „${org.name}” (apare în jurnalul cabinetului):`);
        if (!reason) return;
        await apiPost(`/api/platform/organizations/${org.id}/suspend`, { reason });
      } else if (action === "unsuspend") {
        await apiPost(`/api/platform/organizations/${org.id}/unsuspend`);
      } else if (action === "trial") {
        const days = Number(prompt("Prelungește proba cu câte zile? (1–90)", "14"));
        if (!days) return;
        await apiPost(`/api/platform/organizations/${org.id}/trial`, { days });
      } else if (action === "plan") {
        const plan = prompt(`Plan acordat manual (${PLANS.map((p) => p.code).join(" / ")}). Lăsați gol pentru a anula.`, "enterprise");
        if (!plan) return;
        await apiPost(`/api/platform/organizations/${org.id}/plan`, { plan: plan.trim(), active: true });
      } else {
        setSupport(await apiGet<Support>(`/api/platform/organizations/${org.id}/support`));
        return;
      }
      load(search.trim());
    } catch (e) { setError((e as Error).message); }
  }

  if (user && !user.platformAdmin) return <Alert>Pagina nu există.</Alert>;

  return (
    <div className="fade-up">
      <PageHeader title="Platformă" subtitle="Cabinetele Togato. Datele unui cabinet se pot consulta doar cât timp cabinetul a acordat acces de suport; fiecare acțiune apare și în jurnalul cabinetului."
        actions={<Button variant="secondary" onClick={() => apiGet<{ data: AuditRow[] }>("/api/platform/audit").then((r) => setAudit(r.data)).catch((e) => setError(e.message))}>Jurnalul echipei</Button>} />
      <SystemStatusCard />
      <input className={`${inputClass} mb-4 sm:max-w-sm`} placeholder="Caută cabinet..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Caută cabinet" />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!rows ? <LoadingBlock /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-2.5">Cabinet</th><th className="px-3">Stare</th><th className="px-3">Plan</th><th className="px-3 text-right">Utiliz.</th><th className="px-3 text-right">Clienți</th><th className="px-3 text-right">Sisteme</th><th className="px-3">Ultima activitate</th><th className="px-3">Acțiuni</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2.5"><div className="font-semibold text-ink">{o.name}</div><div className="text-[11px] text-slate-500">din {formatDate(o.createdAt)}{o.suspendedReason ? ` · suspendat: ${o.suspendedReason}` : ""}</div></td>
                  <td className="px-3"><span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", STATE_STYLE[o.billingState])}>{BILLING_STATE_LABELS[o.billingState]}</span>{o.billingState === "proba" && o.trialEndsAt && <div className="mt-0.5 text-[11px] text-slate-500">până la {formatDate(o.trialEndsAt)}</div>}</td>
                  <td className="px-3">{PLANS.find((p) => p.code === o.plan)?.name ?? o.plan}</td>
                  <td className="px-3 text-right tabular-nums">{o.users}</td>
                  <td className="px-3 text-right tabular-nums">{o.clients}</td>
                  <td className="px-3 text-right tabular-nums">{o.systems}</td>
                  <td className="px-3 text-slate-600">{o.lastActiveAt ? formatDate(o.lastActiveAt) : "—"}</td>
                  <td className="px-3">
                    <div className="flex flex-wrap gap-1">
                      {o.status === "suspendat" ? <Button size="sm" variant="secondary" onClick={() => act(o, "unsuspend")}>Reactivează</Button> : <Button size="sm" variant="danger" onClick={() => act(o, "suspend")}>Suspendă</Button>}
                      <Button size="sm" variant="ghost" onClick={() => act(o, "trial")}>Probă +</Button>
                      <Button size="sm" variant="ghost" onClick={() => act(o, "plan")}>Plan</Button>
                      <Button size="sm" variant={o.supportAccess ? "secondary" : "ghost"} disabled={!o.supportAccess} title={o.supportAccess ? `Acces acordat până la ${formatDate(o.supportAccessUntil!)}` : "Cabinetul nu a acordat acces de suport"} onClick={() => act(o, "support")}>Suport</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">{rows.length} din {total} cabinete</div>
        </Card>
      )}

      <Modal open={!!support} onClose={() => setSupport(null)} title={`Suport — ${support?.organization.name ?? ""}`} wide>
        {support && (
          <div className="space-y-4 text-[13px]">
            <Alert kind="info">Doar citire. Acces acordat de cabinet până la {formatDate(support.organization.supportAccessUntil)}. Consultarea a fost înregistrată în jurnalul cabinetului.</Alert>
            <section><h3 className="mb-1 font-semibold">Utilizatori</h3><ul className="space-y-0.5">{support.members.map((m) => <li key={m.id}>{m.name} · {m.email} · {m.role}{m.status !== "activ" ? " · dezactivat" : ""}{m.totpEnabled ? " · 2FA" : ""}</li>)}</ul></section>
            <section><h3 className="mb-1 font-semibold">Clienți ({support.clients.length})</h3><ul className="space-y-0.5">{support.clients.map((cl) => <li key={cl.id}>{cl.name}{cl.cui ? ` · CUI ${cl.cui}` : ""} · {cl.systems} sisteme{cl.archivedAt ? " · arhivat" : ""}</li>)}</ul></section>
            <section><h3 className="mb-1 font-semibold">Sisteme AI</h3><ul className="space-y-1">{support.systems.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-2"><RiskBadge level={s.riskLevel} /> {s.name} · {s.reviewStatus} · reguli {s.rulesetVersion}{s.aiMemoStatus === "esuat" ? ` · memoriu eșuat: ${s.aiMemoError}` : ""}</li>)}</ul></section>
            <section><h3 className="mb-1 font-semibold">Activitate recentă</h3><ul className="space-y-0.5 text-[12px] text-slate-600">{support.activity.map((a, i) => <li key={i}>{formatDate(a.at)} · {a.user ?? "portal / sistem"} · {a.action} {a.entity}</li>)}</ul></section>
          </div>
        )}
      </Modal>

      <Modal open={!!audit} onClose={() => setAudit(null)} title="Jurnalul echipei Togato" wide>
        <ul className="divide-y divide-slate-100 text-[12px]">
          {audit?.map((a) => <li key={a.id} className="py-1.5"><b>{a.action}</b> · {a.organizationName ?? "—"} · {a.actorEmail} · {new Date(a.createdAt).toLocaleString("ro-RO")}{a.details ? <span className="text-slate-500"> · {JSON.stringify(a.details)}</span> : null}</li>)}
        </ul>
      </Modal>
    </div>
  );
}
