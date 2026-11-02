"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { AiSystem, Obligation, ReviewStatus } from "@togato/shared";
import { ANNEX_III_USES, PROHIBITED_PRACTICES, ROLE_OPTIONS, TRANSPARENCY_TRIGGERS } from "@togato/shared";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, LoadingBlock, PageHeader, ProgressBar, ReviewBadge, RiskBadge, Spinner, textareaClass } from "@/components/ui";
import { ObligationList } from "@/components/ObligationList";
import { Markdown } from "@/components/Markdown";
import { SystemForm } from "@/components/SystemForm";

type SystemDetail = AiSystem & { client: { id: string; name: string; cui: string | null }; obligations: Obligation[] };

function ReviewPanel({ system, onChange }: { system: SystemDetail; onChange: (s: SystemDetail) => void }) {
  const [note, setNote] = useState(system.reviewNote || "");
  const [busy, setBusy] = useState<ReviewStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(status: ReviewStatus) {
    setBusy(status); setError(null);
    try {
      onChange(await apiPost<SystemDetail>(`/api/ai-systems/${system.id}/review`, { status, note: note || null }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-ink">Verificarea avocatului</h2>
        <ReviewBadge status={system.reviewStatus} />
      </div>
      {system.reviewedAt && system.reviewStatus !== "propus" && (
        <p className="mt-1 text-[12px] text-slate-500">{system.reviewedByName || "—"} · {formatDate(system.reviewedAt)}</p>
      )}
      <textarea className={`${textareaClass} mt-3`} rows={3} placeholder="Notă (opțional): motivarea deciziei, ce trebuie confirmat cu clientul..." value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => review("aprobat")} loading={busy === "aprobat"} disabled={!!busy}>Aprob încadrarea</Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => review("respins")} loading={busy === "respins"} disabled={!!busy}>Resping</Button>
      </div>
    </Card>
  );
}

function MemoPanel({ system, onChange }: { system: SystemDetail; onChange: (s: SystemDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true); setError(null);
    try {
      onChange(await apiPost<SystemDetail>(`/api/ai-systems/${system.id}/memo`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-ink">Analiză AI</h2>
        <Button size="sm" variant="secondary" onClick={generate} loading={busy}>{system.aiMemo ? "Regenerează" : "Generează"}</Button>
      </div>
      {busy && <p className="mt-3 flex items-center gap-2 text-[12px] text-slate-500"><Spinner className="h-3.5 w-3.5" /> Se analizează dosarul (poate dura până la un minut)...</p>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {system.aiMemo ? (
        <div className="mt-3">
          <Markdown text={system.aiMemo} />
          <p className="mt-3 text-[11px] text-slate-400">Generat {system.aiMemoAt ? formatDate(system.aiMemoAt) : ""}. Verificați citările înainte de a le folosi.</p>
        </div>
      ) : !busy && (
        <p className="mt-2 text-[12px] text-slate-500">Un memoriu scurt: justificarea încadrării, puncte de verificat cu clientul și pașii recomandați.</p>
      )}
    </Card>
  );
}

export default function SystemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [system, setSystem] = useState<SystemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    apiGet<SystemDetail>(`/api/ai-systems/${id}`).then(setSystem).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!system) return <LoadingBlock />;

  const back = <Link href={`/clients/${system.client.id}`} className="mb-3 inline-block text-[13px] text-slate-500 hover:text-brand">‹ {system.client.name}</Link>;

  if (editing) {
    return (
      <div className="fade-up">
        {back}
        <PageHeader title={`Editează: ${system.name}`} subtitle="Dacă schimbi răspunsurile, încadrarea va trebui reaprobată." />
        <SystemForm
          initial={{ name: system.name, vendor: system.vendor || "", description: system.description || "", purpose: system.purpose || "", department: system.department || "", answers: system.answers }}
          submitLabel="Salvează modificările"
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            setSystem(await apiPut<SystemDetail>(`/api/ai-systems/${system.id}`, v));
            setEditing(false);
          }}
        />
      </div>
    );
  }

  async function remove() {
    if (!system || !confirm(`Ștergi sistemul „${system.name}” și obligațiile lui?`)) return;
    try {
      await apiDelete(`/api/ai-systems/${system.id}`);
      router.replace(`/clients/${system.client.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const c = system.classification;
  const a = system.answers;
  const active = system.obligations.filter((o) => o.status !== "nu_se_aplica");
  const done = active.filter((o) => o.status === "indeplinit").length;
  const label = (list: { code: string; label: string }[], codes: string[]) => codes.map((code) => list.find((o) => o.code === code)?.label).filter(Boolean) as string[];
  const facts: [string, string[]][] = [
    ["Rolul firmei", [ROLE_OPTIONS.find((r) => r.code === a.role)?.label || "—"]],
    ["Practici interzise", label(PROHIBITED_PRACTICES, a.prohibited)],
    ["Domenii Anexa III", label(ANNEX_III_USES, a.annexIII)],
    ["Transparență", label(TRANSPARENCY_TRIGGERS, a.transparency)],
  ];

  return (
    <div className="fade-up">
      {back}
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{system.name} <RiskBadge level={system.riskLevel} className="text-[13px]" /></span>}
        subtitle={[system.vendor, system.department, system.purpose].filter(Boolean).join(" · ") || undefined}
        actions={<>
          <Button variant="danger" size="sm" onClick={remove}>Șterge</Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Editează răspunsurile</Button>
        </>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {c && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-ink">De ce această încadrare</h2>
              <p className="mt-1 text-[13px] text-slate-500">Rol: <b className="text-slate-700">{c.role === "furnizor" ? "furnizor" : "implementator"}</b>{c.highRiskBasis && <> · temei: <b className="text-slate-700">{c.highRiskBasis === "anexa_i" ? "Anexa I" : "Anexa III"}</b></>}</p>
              <ul className="mt-3 space-y-2">
                {c.reasons.map((r, i) => (
                  <li key={i} className="flex gap-3 text-[13px] text-slate-700">
                    <span className="w-28 shrink-0 font-mono text-[12px] text-slate-400">{r.article}</span>
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
              {c.warnings.length > 0 && <div className="mt-3 space-y-2">{c.warnings.map((w, i) => <Alert key={i} kind="warning">{w}</Alert>)}</div>}
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-[14px] font-semibold text-ink">Obligații</h2>
              <div className="w-44"><ProgressBar done={done} total={active.length} /></div>
            </div>
            <ObligationList items={system.obligations} onChange={(o) => setSystem((s) => s && { ...s, obligations: s.obligations.map((x) => (x.id === o.id ? o : x)) })} />
          </Card>

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-ink">Răspunsuri la chestionar</h2>
            {system.description && <p className="mt-2 text-[13px] text-slate-600">{system.description}</p>}
            <dl className="mt-3 space-y-3">
              {facts.map(([k, vals]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="text-[13px] text-slate-700">{vals.length ? vals.join("; ") : "Niciunul"}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <div className="space-y-5">
          <ReviewPanel system={system} onChange={setSystem} />
          <MemoPanel system={system} onChange={setSystem} />
        </div>
      </div>
    </div>
  );
}
