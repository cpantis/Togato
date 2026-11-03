"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  DPIA_LIKELIHOOD_LABELS, DPIA_OUTCOME_LABELS, DPIA_RISK_LABELS, DPIA_SEVERITY_LABELS, assessDpia, dpiaRiskLevel,
  type DpiaData, type DpiaLevel, type DpiaResponse, type DpiaRisk, type DpiaRiskLevel,
} from "@togato/shared";
import { apiDownload, apiGet, apiPut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, Field, LoadingBlock, PageHeader, cn, inputClass, textareaClass } from "@/components/ui";
import { Pill } from "@/components/gdpr/common";

type Draft = Omit<DpiaData, "id" | "finalizedAt" | "updatedAt" | "assessment">;
const LEVELS: DpiaLevel[] = [1, 2, 3];
const TONE: Record<DpiaRiskLevel, "green" | "amber" | "red"> = { scazut: "green", mediu: "amber", ridicat: "red" };

function LevelSelect({ label, value, onChange, labels }: { label: string; value: DpiaLevel; onChange: (v: DpiaLevel) => void; labels: Record<DpiaLevel, string> }) {
  return (
    <label className="block text-[12px] text-slate-600">{label}
      <select className={cn(inputClass, "mt-0.5 h-9 text-[13px]")} value={value} onChange={(e) => onChange(Number(e.target.value) as DpiaLevel)}>
        {LEVELS.map((l) => <option key={l} value={l}>{labels[l]}</option>)}
      </select>
    </label>
  );
}

function RiskEditor({ r, onChange, onRemove }: { r: DpiaRisk; onChange: (r: DpiaRisk) => void; onRemove: () => void }) {
  const inherent = dpiaRiskLevel(r.likelihood, r.severity);
  const residual = dpiaRiskLevel(r.residualLikelihood, r.residualSeverity);
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputClass, "h-9 flex-1 font-semibold")} value={r.title} onChange={(e) => onChange({ ...r, title: e.target.value })} aria-label="Riscul" />
        <button type="button" onClick={onRemove} className="text-[12px] text-slate-500 hover:text-red-700">Elimină</button>
      </div>
      <textarea className={cn(textareaClass, "mt-2")} rows={2} value={r.description} onChange={(e) => onChange({ ...r, description: e.target.value })} aria-label="Descrierea riscului" placeholder="Cum se poate produce și ce efect ar avea asupra persoanelor" />
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <LevelSelect label="Probabilitate" value={r.likelihood} labels={DPIA_LIKELIHOOD_LABELS} onChange={(v) => onChange({ ...r, likelihood: v })} />
        <LevelSelect label="Gravitate" value={r.severity} labels={DPIA_SEVERITY_LABELS} onChange={(v) => onChange({ ...r, severity: v })} />
        <div className="pb-1.5"><Pill tone={TONE[inherent]}>Inițial: {DPIA_RISK_LABELS[inherent]}</Pill></div>
      </div>
      <Field label="Măsuri de atenuare"><textarea className={textareaClass} rows={2} value={r.measures} onChange={(e) => onChange({ ...r, measures: e.target.value })} /></Field>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <LevelSelect label="Probabilitate după măsuri" value={r.residualLikelihood} labels={DPIA_LIKELIHOOD_LABELS} onChange={(v) => onChange({ ...r, residualLikelihood: v })} />
        <LevelSelect label="Gravitate după măsuri" value={r.residualSeverity} labels={DPIA_SEVERITY_LABELS} onChange={(v) => onChange({ ...r, residualSeverity: v })} />
        <div className="pb-1.5"><Pill tone={TONE[residual]}>Rezidual: {DPIA_RISK_LABELS[residual]}</Pill></div>
      </div>
    </li>
  );
}

export default function DpiaPage() {
  const { id, processingId } = useParams<{ id: string; processingId: string }>();
  const [data, setData] = useState<DpiaResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"save" | "finalize" | null>(null);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    apiGet<DpiaResponse>(`/api/processing/${processingId}/dpia`).then((r) => {
      setData(r);
      const { id: _i, finalizedAt: _f, updatedAt: _u, assessment: _a, ...d } = r.dpia;
      setDraft(d);
    }).catch((e) => setMsg({ kind: "error", text: e.message }));
  }, [processingId]);

  const live = useMemo(() => (draft ? assessDpia({ necessity: draft.necessity, risks: draft.risks }) : null), [draft]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => d && { ...d, [k]: v });

  async function save(finalize: boolean) {
    if (!draft) return;
    setBusy(finalize ? "finalize" : "save"); setMsg(null);
    try {
      const r = await apiPut<DpiaResponse>(`/api/processing/${processingId}/dpia`, { ...draft, finalize });
      setData(r);
      setMsg({ kind: "info", text: finalize ? "Evaluarea a fost finalizată." : "Proiectul a fost salvat." });
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); } finally { setBusy(null); }
  }

  if (!data || !draft || !live) return msg ? <Alert>{msg.text}</Alert> : <LoadingBlock />;
  const a = data.activity;
  const newRisk = (): DpiaRisk => ({ id: crypto.randomUUID(), title: "Risc nou", description: "", likelihood: 2, severity: 2, measures: "", residualLikelihood: 1, residualSeverity: 2 });

  return (
    <div className="fade-up">
      <Link href={`/clients/${id}/gdpr?tab=registru`} className="mb-3 inline-block text-[13px] text-slate-500 hover:text-brand">‹ Registrul prelucrărilor</Link>
      <PageHeader title="Evaluarea de impact" subtitle={`${a.name} · Art. 35 GDPR`}
        actions={<Button variant="secondary" size="sm" disabled={!data.saved} onClick={() => apiDownload(`/api/processing/${processingId}/dpia/docx`, "dpia.docx").catch((e) => setMsg({ kind: "error", text: e.message }))}>Descarcă .docx</Button>} />
      {a.check.dpiaMandatory
        ? <div className="mb-4"><Alert kind="warning">Evaluarea este obligatorie: {a.check.dpiaMandatoryReasons.join("; ")}.</Alert></div>
        : <div className="mb-4"><Alert kind="info">{a.check.dpiaLikely ? `Evaluarea e probabil necesară (${a.check.dpiaReasons.join(", ")}).` : "Criteriile introduse în registru nu impun evaluarea; o puteți face din prudență."}</Alert></div>}
      {!data.saved && <div className="mb-4"><Alert kind="info">Proiect precompletat din registru, cu riscuri propuse. Ajustați-l și salvați.</Alert></div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <Field label="1. Descrierea operațiunilor (Art. 35(7)(a))"><textarea className={textareaClass} rows={6} value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
            <Field label="2. Necesitate și proporționalitate (Art. 35(7)(b))" hint="De ce e necesară prelucrarea, de ce nu există o alternativă mai puțin intruzivă; minimizare, păstrare, informarea persoanelor."><textarea className={textareaClass} rows={5} value={draft.necessity ?? ""} onChange={(e) => set("necessity", e.target.value)} /></Field>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-ink">3. Riscuri și măsuri (Art. 35(7)(c)–(d))</h2>
              <Button size="sm" variant="secondary" onClick={() => set("risks", [...draft.risks, newRisk()])}>Adaugă un risc</Button>
            </div>
            <ul className="mt-3 space-y-3">
              {draft.risks.map((r, i) => (
                <RiskEditor key={r.id} r={r} onChange={(nr) => set("risks", draft.risks.map((x, j) => (j === i ? nr : x)))} onRemove={() => set("risks", draft.risks.filter((_, j) => j !== i))} />
              ))}
            </ul>
          </Card>
          <Card className="space-y-4 p-5">
            <Field label="4. Avizul responsabilului cu protecția datelor (Art. 35(2))"><textarea className={textareaClass} rows={3} value={draft.dpoOpinion ?? ""} onChange={(e) => set("dpoOpinion", e.target.value)} /></Field>
            <Field label="Opinia persoanelor vizate sau a reprezentanților lor (Art. 35(9))"><textarea className={textareaClass} rows={3} value={draft.subjectsViews ?? ""} onChange={(e) => set("subjectsViews", e.target.value)} /></Field>
            <Field label="Data reevaluării (Art. 35(11))"><input type="date" className={cn(inputClass, "sm:w-56")} value={draft.reviewOn ?? ""} onChange={(e) => set("reviewOn", e.target.value || null)} /></Field>
          </Card>
        </div>
        <div className="lg:sticky lg:top-6 lg:h-fit">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-ink">Concluzie</h2>
            {live.missing.length > 0 ? (
              <>
                <p className="mt-2 text-[13px] font-semibold text-slate-700">Evaluare incompletă</p>
                <p className="mt-1 text-[12px] text-slate-600">Concluzie provizorie: {DPIA_OUTCOME_LABELS[live.outcome].toLowerCase()}.</p>
              </>
            ) : (
              <p className={cn("mt-2 text-[13px] font-semibold", live.outcome === "consultare_prealabila" ? "text-red-800" : live.outcome === "acceptabil" ? "text-emerald-800" : "text-amber-800")}>{DPIA_OUTCOME_LABELS[live.outcome]}</p>
            )}
            {live.outcome === "consultare_prealabila" && <p className="mt-1 text-[12px] text-slate-600">Prelucrarea nu începe până la răspunsul ANSPDCP.</p>}
            {live.missing.length > 0 && (
              <ul className="mt-3 space-y-1 text-[12px] text-amber-800">{live.missing.map((m) => <li key={m}>• {m}</li>)}</ul>
            )}
            {data.dpia.finalizedAt && <p className="mt-3 text-[12px] text-slate-600">Finalizată la {formatDate(data.dpia.finalizedAt)}. Orice modificare o readuce la stadiul de proiect.</p>}
            {msg && <div className="mt-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="secondary" loading={busy === "save"} disabled={!!busy} onClick={() => save(false)}>Salvează proiectul</Button>
              <Button loading={busy === "finalize"} disabled={!!busy || live.missing.length > 0} onClick={() => save(true)}>Finalizează evaluarea</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
