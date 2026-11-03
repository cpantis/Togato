"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { AiSystem, Obligation, ReviewStatus, RiskLevel, SystemDetail } from "@togato/shared";
import { LEGAL_ROLE_LABELS, QUALIFICATION_OPTIONS, RISK_LABELS, SCOPE_EXCLUSIONS } from "@togato/shared";
import { ANNEX_III_USES, PORTAL_QUESTIONS, PROHIBITED_PRACTICES, ROLE_OPTIONS, TRANSPARENCY_TRIGGERS, portalFlags } from "@togato/shared";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, LoadingBlock, PageHeader, ProgressBar, ReviewBadge, RiskBadge, Spinner, textareaClass } from "@/components/ui";
import { ObligationList } from "@/components/ObligationList";
import { Markdown } from "@/components/Markdown";
import { SystemForm } from "@/components/SystemForm";
import { LawRef } from "@/components/LawRef";
import { useAuth } from "@/hooks/useAuth";
import { SnapshotsCard } from "@/components/SnapshotsCard";


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

const OVERRIDE_LEVELS: RiskLevel[] = ["neaplicabil", "minim", "transparenta", "risc_ridicat", "interzis"];

function OverridePanel({ system, onChange }: { system: SystemDetail; onChange: (s: SystemDetail) => void }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<RiskLevel>(system.riskOverride ?? system.computedRiskLevel ?? "minim");
  const [reason, setReason] = useState(system.overrideReason || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(riskLevel: RiskLevel | null) {
    setBusy(true); setError(null);
    try {
      onChange(await apiPost<SystemDetail>(`/api/ai-systems/${system.id}/override`, { riskLevel, reason: riskLevel ? reason : null }));
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Încadrare manuală</h2>
      {system.riskOverride ? (
        <div className="mt-2 space-y-2 text-[13px] text-slate-600">
          <p>Avocatul a stabilit <b className="text-ink">{RISK_LABELS[system.riskOverride]}</b>{system.computedRiskLevel && system.computedRiskLevel !== system.riskOverride && <> (calculat: {RISK_LABELS[system.computedRiskLevel]})</>}.</p>
          {system.overrideReason && <p className="rounded-lg bg-slate-50 p-2.5 text-[12px] italic">„{system.overrideReason}”</p>}
          <p className="text-[12px] text-slate-400">{system.overrideByName} · {formatDate(system.overrideAt)}</p>
          <p className="text-[12px] text-slate-500">Obligațiile rămân cele calculate; marcați-le „Nu se aplică” acolo unde e cazul. La o modificare a legii, încadrarea manuală nu se suprascrie.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} disabled={busy}>Modifică</Button>
            <Button size="sm" variant="ghost" onClick={() => save(null)} loading={busy && !open}>Revino la cea calculată</Button>
          </div>
        </div>
      ) : (
        <div className="mt-1">
          <p className="text-[12px] text-slate-500">Dacă analiza dumneavoastră diferă de încadrarea propusă, o puteți stabili manual, cu motivare.</p>
          {!open && <Button size="sm" variant="secondary" className="mt-3" onClick={() => setOpen(true)}>Stabilește manual</Button>}
        </div>
      )}
      {open && (
        <div className="mt-3 space-y-2">
          <select className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px]" value={level} onChange={(e) => setLevel(e.target.value as RiskLevel)} aria-label="Nivel de risc">
            {OVERRIDE_LEVELS.map((l) => <option key={l} value={l}>{RISK_LABELS[l]}</option>)}
          </select>
          <textarea className={textareaClass} rows={3} placeholder="Motivarea (obligatorie): de ce încadrarea diferă de cea calculată" value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save(level)} loading={busy}>Salvează încadrarea</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Renunță</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function MemoPanel({ system, onChange }: { system: SystemDetail; onChange: (s: SystemDetail) => void }) {
  const { organization, user } = useAuth();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = system.aiMemoStatus === "in_lucru";
  const busy = requesting || pending;

  // generarea rulează pe server; verificăm periodic până e gata
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const fresh = await apiGet<SystemDetail>(`/api/ai-systems/${system.id}`);
        if (!cancelled && fresh.aiMemoStatus !== "in_lucru") onChange(fresh);
      } catch { /* reîncearcă la următorul pas */ }
    }, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [pending, system.id, onChange]);

  async function generate() {
    setRequesting(true); setError(null);
    try {
      onChange(await apiPost<SystemDetail>(`/api/ai-systems/${system.id}/memo`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-ink">Analiză AI</h2>
        <Button size="sm" variant="secondary" onClick={generate} loading={busy} disabled={!organization?.aiEnabled}>{system.aiMemo ? "Regenerează" : "Generează"}</Button>
      </div>
      {!organization?.aiEnabled && (
        <p className="mt-2 text-[12px] text-slate-500">
          Analiza AI e dezactivată pentru cabinet, deoarece trimite date despre client către furnizorul modelului.{" "}
          {user?.role === "admin" ? <Link href="/settings#securitate" className="font-semibold text-brand hover:underline">Activați-o din Setări</Link> : "Un administrator o poate activa din Setări."}
        </p>
      )}
      {busy && <p className="mt-3 flex items-center gap-2 text-[12px] text-slate-500" role="status"><Spinner className="h-3.5 w-3.5" /> Se analizează dosarul (poate dura până la un minut). Puteți părăsi pagina — memoriul se salvează automat.</p>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {!busy && system.aiMemoStatus === "esuat" && system.aiMemoError && <div className="mt-3"><Alert>{system.aiMemoError}</Alert></div>}
      {system.aiMemo ? (
        <div className="mt-3">
          <Markdown text={system.aiMemo} />
          {system.aiMemoCitations.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Surse din textul oficial</div>
              <ol className="space-y-2">
                {system.aiMemoCitations.map((c) => (
                  <li key={c.n} id={`sursa-${c.n}`} className="scroll-mt-20 text-[12px] text-slate-600">
                    <span className="mr-1 font-semibold text-brand">[{c.n}]</span>
                    <LawRef text={c.ref} />
                    {c.quote && <span className="mt-1 block border-l-2 border-slate-200 pl-2 italic text-slate-500">„{c.quote.length > 280 ? `${c.quote.slice(0, 280)}…` : c.quote}”</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Generat {system.aiMemoAt ? formatDate(system.aiMemoAt) : ""}.{" "}
            {system.aiMemoCitations.length > 0
              ? "Citatele provin din textul oficial (versiunea inițială din JO, fără Omnibus); verificați concluziile."
              : "Verificați trimiterile înainte de a le folosi."}
          </p>
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
    ["E sistem de IA (Art. 3 pct. 1)", [QUALIFICATION_OPTIONS.find((q) => q.code === a.qualification)?.label ?? "—"]],
    ["Excluderi (Art. 2)", label(SCOPE_EXCLUSIONS, a.scopeExclusions)],
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
          {system.reclassNote && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="text-[14px] font-semibold text-amber-900">Reîncadrat după modificarea legislației</div>
              <p className="mt-1 text-[13px] leading-relaxed text-amber-800">{system.reclassNote}</p>
              <p className="mt-2 text-[12px] text-amber-700">Verificați încadrarea și obligațiile, apoi aprobați sau respingeți încadrarea în panoul din dreapta. {system.reclassifiedAt && `Reîncadrat la ${formatDate(system.reclassifiedAt)}.`}</p>
            </div>
          )}

          {(system.source === "portal" || system.source === "autoevaluare") && system.portalAnswers && (
            <Card className="border-sky-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[14px] font-semibold text-ink">{system.source === "portal" ? "Trimis de client prin portal" : "Din autoevaluarea gratuită a firmei"}</h2>
                <span className="text-[12px] text-slate-500">{system.submittedByName}{system.submittedByEmail ? ` · ${system.submittedByEmail}` : ""} · {formatDate(system.createdAt)}</span>
              </div>
              <p className="mt-1 text-[12px] text-slate-500">Încadrarea de mai jos e dedusă automat din răspunsurile clientului. Verificați-o și completați chestionarul cu „Editează răspunsurile”.</p>
              {portalFlags(system.portalAnswers).map((f, i) => <div key={i} className="mt-2"><Alert kind="warning">{f}</Alert></div>)}
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                {PORTAL_QUESTIONS.map((q) => (
                  <li key={q.key} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
                    <span className="text-slate-600">{q.label}</span>
                    <span className={system.portalAnswers![q.key] ? "font-semibold text-ink" : "text-slate-400"}>{system.portalAnswers![q.key] ? "Da" : "Nu"}</span>
                  </li>
                ))}
              </ul>
              {system.portalAnswers.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[13px] italic text-slate-700">„{system.portalAnswers.notes}”</p>}
            </Card>
          )}

          {c && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-ink">De ce această încadrare</h2>
              {system.riskOverride && system.riskOverride !== c.riskLevel && (
                <div className="mt-2"><Alert kind="info">Încadrarea afișată ({RISK_LABELS[system.riskOverride]}) a fost stabilită manual de avocat. Mai jos este încadrarea calculată: {RISK_LABELS[c.riskLevel]}.</Alert></div>
              )}
              <p className="mt-1 text-[13px] text-slate-500">Rol: <b className="text-slate-700">{LEGAL_ROLE_LABELS[c.role].toLowerCase()}</b>{c.highRiskBasis && <> · temei: <b className="text-slate-700">{c.highRiskBasis === "anexa_i" ? "Anexa I" : "Anexa III"}</b></>}</p>
              <ul className="mt-3 space-y-2">
                {c.reasons.map((r, i) => (
                  <li key={i} className="flex gap-3 text-[13px] text-slate-700">
                    <span className="w-40 shrink-0"><LawRef text={r.article} className="whitespace-normal" /></span>
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
              {c.warnings.length > 0 && <div className="mt-3 space-y-2">{c.warnings.map((w, i) => <Alert key={i} kind="warning">{w}</Alert>)}</div>}
              <p className="mt-3 text-[11px] text-slate-400">Calculat după regulile AI Act, versiunea {system.rulesetVersion}.</p>
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
          <OverridePanel key={`${system.riskOverride}-${system.overrideAt}`} system={system} onChange={setSystem} />
          <SnapshotsCard systemId={system.id} refreshKey={`${system.reviewedAt}-${system.overrideAt}`} />
          <MemoPanel system={system} onChange={setSystem} />
        </div>
      </div>
    </div>
  );
}
