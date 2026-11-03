"use client";
import { useEffect, useState } from "react";
import { BILLING_STATE_LABELS, type BillingState, type PlanDef } from "@togato/shared";
import { apiGet, apiPost } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, cn } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

type Billing = {
  state: BillingState;
  plan: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: { maxClients: number | null; maxUsers: number | null };
  usage: { activeClients: number; activeUsers: number; pendingInvites: number };
  onlinePayments: boolean;
  hasCustomer: boolean;
  plans: (PlanDef & { purchasable: boolean })[];
};

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@togato.ro";

const STATE_STYLE: Record<BillingState, string> = {
  proba: "bg-sky-50 text-sky-700",
  activ: "bg-emerald-50 text-emerald-700",
  restant: "bg-amber-50 text-amber-800",
  expirat: "bg-red-50 text-red-700",
  suspendat: "bg-red-50 text-red-700",
};

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[12px] text-slate-600"><span>{label}</span><span className="tabular-nums">{used}{max !== null ? ` / ${max}` : " (nelimitat)"}</span></div>
      {max !== null && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", pct >= 90 ? "bg-amber-500" : "bg-brand")} style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}

/** Abonamentul cabinetului: starea, consumul față de limite, planurile și plata online. */
export function BillingCard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [b, setB] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paid = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("abonament") === "ok";

  useEffect(() => { apiGet<Billing>("/api/billing").then(setB).catch((e) => setError(e.message)); }, []);

  async function go(path: string, body?: unknown, key = path) {
    setBusy(key); setError(null);
    try {
      const { url } = await apiPost<{ url: string }>(path, body);
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  if (!b) return <Card className="p-5"><h2 className="text-[14px] font-semibold text-ink">Abonament</h2>{error && <div className="mt-3"><Alert>{error}</Alert></div>}</Card>;
  const current = b.plans.find((p) => p.code === b.plan);
  const subscribed = b.state === "activ" || b.state === "restant";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-ink">Abonament</h2>
        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", STATE_STYLE[b.state])}>{BILLING_STATE_LABELS[b.state]}</span>
      </div>
      {paid && b.state === "proba" && <div className="mt-3"><Alert kind="info">Plata a fost înregistrată. Abonamentul se activează în câteva momente, după confirmarea de la procesatorul de plăți.</Alert></div>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <p className="mt-2 text-[12px] text-slate-500">
        {b.state === "proba" && b.trialEndsAt && <>Perioada de probă se încheie la {formatDate(b.trialEndsAt)}. După aceea, datele rămân disponibile pentru consultare și export.</>}
        {subscribed && <>Plan <b>{current?.name ?? b.plan}</b>{b.currentPeriodEnd && <>, {b.cancelAtPeriodEnd ? "se încheie" : "se reînnoiește"} la {formatDate(b.currentPeriodEnd)}</>}.</>}
        {b.state === "expirat" && <>Modificările sunt blocate până la alegerea unui abonament. Consultarea și exportul dosarelor funcționează în continuare.</>}
      </p>

      <div className="mt-4 space-y-3">
        <Usage label="Clienți activi" used={b.usage.activeClients} max={b.limits.maxClients} />
        <Usage label="Utilizatori (inclusiv invitații)" used={b.usage.activeUsers + b.usage.pendingInvites} max={b.limits.maxUsers} />
      </div>

      {isAdmin && b.hasCustomer && (
        <div className="mt-4"><Button size="sm" variant="secondary" loading={busy === "portal"} onClick={() => go("/api/billing/portal", undefined, "portal")}>Facturi, card și schimbarea planului</Button></div>
      )}

      {!subscribed && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {b.plans.map((p) => (
            <div key={p.code} className="flex flex-col rounded-lg border border-slate-200 p-3">
              <div className="text-[13px] font-bold text-ink">{p.name}</div>
              <div className="mt-0.5 text-[12px] text-slate-500">{p.priceEur !== null ? <><b className="text-[15px] text-ink">{p.priceEur} €</b> / lună + TVA</> : "Preț la cerere"}</div>
              <ul className="mt-2 flex-1 space-y-1 text-[12px] text-slate-600">{p.features.map((f) => <li key={f}>• {f}</li>)}</ul>
              <div className="mt-3">
                {p.purchasable && isAdmin ? (
                  <Button size="sm" className="w-full" loading={busy === p.code} onClick={() => go("/api/billing/checkout", { plan: p.code }, p.code)}>Alege {p.name}</Button>
                ) : (
                  <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Abonament ${p.name}`)}`} className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Contactați-ne</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!isAdmin && !subscribed && <p className="mt-3 text-[12px] text-slate-500">Abonamentul îl alege un administrator al cabinetului.</p>}
      {!b.onlinePayments && <p className="mt-3 text-[11px] text-slate-400">Plata online nu este încă activă; abonamentele se activează la cerere.</p>}
    </Card>
  );
}
