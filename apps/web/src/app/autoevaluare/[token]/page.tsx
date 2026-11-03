"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  EMPTY_PORTAL_ANSWERS, JUDETE, PORTAL_QUESTIONS, SELF_ASSESSMENT_DISCLAIMER, SELF_VERDICT_LABELS,
  type DirectoryCabinet, type Page, type PortalAnswers, type SelfAssessmentData, type SelfVerdict,
} from "@togato/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PublicShell } from "@/components/PublicShell";
import { YesNo } from "@/components/YesNo";
import { Alert, Button, Card, Field, LoadingBlock, Modal, cn, inputClass, textareaClass } from "@/components/ui";

const VERDICT_STYLE: Record<SelfVerdict, string> = {
  minim: "bg-emerald-50 text-emerald-800 border-emerald-200",
  transparenta: "bg-sky-50 text-sky-800 border-sky-200",
  risc_ridicat: "bg-orange-50 text-orange-800 border-orange-200",
  de_verificat: "bg-amber-50 text-amber-800 border-amber-200",
};
const STATUS_LABEL = { nou: "Trimisă — așteaptă răspuns", acceptat: "Acceptată", respins: "Refuzată" } as const;
const EMPTY_TOOL = { name: "", vendor: "", purpose: "" };

function VerdictBadge({ v }: { v: SelfVerdict }) {
  return <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap", VERDICT_STYLE[v])}>{SELF_VERDICT_LABELS[v]}</span>;
}

function Obligations({ items }: { items: { code: string; article: string; title: string; description: string; appliesFrom: string }[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((o) => (
        <li key={o.code} className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[13px] font-semibold text-ink">{o.title} <span className="font-normal text-slate-500">· {o.article}</span></div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-slate-600">{o.description}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">Se aplică din {formatDate(o.appliesFrom)}</div>
        </li>
      ))}
    </ul>
  );
}

export default function SelfAssessmentPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const base = `/api/self-assessments/${encodeURIComponent(token)}`;
  const [data, setData] = useState<SelfAssessmentData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [tool, setTool] = useState(EMPTY_TOOL);
  const [answers, setAnswers] = useState<PortalAnswers>(EMPTY_PORTAL_ANSWERS);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // directorul
  const [county, setCounty] = useState("");
  const [search, setSearch] = useState("");
  const [counties, setCounties] = useState<string[]>([]);
  const [cabinets, setCabinets] = useState<Page<DirectoryCabinet> | null>(null);
  const [chosen, setChosen] = useState<DirectoryCabinet | null>(null);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);

  const load = useCallback(async () => {
    try {
      // linkul din email are ?confirmare=<cod>: confirmă adresa, apoi scoate codul din bara de adrese
      const code = new URLSearchParams(window.location.search).get("confirmare");
      const d = code
        ? await api<SelfAssessmentData>(`${base}/verify`, { method: "POST", body: JSON.stringify({ code }) }).catch(() => api<SelfAssessmentData>(base))
        : await api<SelfAssessmentData>(base);
      if (code) router.replace(`/autoevaluare/${token}`);
      setData(d);
      setCounty((c) => c || d.county || "");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [base, router, token]);
  useEffect(() => { void load(); }, [load]);
  const [resent, setResent] = useState(false);
  async function resend() {
    setError(null);
    try { await api(`${base}/resend-confirmation`, { method: "POST" }); setResent(true); } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { api<{ data: string[] }>("/api/directory/counties").then((r) => setCounties(r.data)).catch(() => undefined); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ limit: "30" });
      if (county) qs.set("county", county);
      if (search.trim()) qs.set("search", search.trim());
      api<Page<DirectoryCabinet>>(`/api/directory?${qs}`).then(setCabinets).catch(() => setCabinets({ data: [], total: 0, limit: 30, offset: 0 }));
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [county, search]);

  async function call(path: string, method: string, body?: unknown) {
    setBusy(true); setError(null);
    try {
      const d = await api<SelfAssessmentData>(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      setData(d);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addTool(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/tools", "POST", { ...tool, vendor: tool.vendor || null, purpose: tool.purpose || null, answers })) {
      setTool(EMPTY_TOOL); setAnswers(EMPTY_PORTAL_ANSWERS); setAdding(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    if (await call("/requests", "POST", { organizationId: chosen.id, message: message || null, consent })) {
      setChosen(null); setMessage(""); setConsent(false);
    }
  }

  async function removeAll() {
    if (!confirm("Ștergeți definitiv autoevaluarea? Solicitările deja trimise rămân la cabinetele respective.")) return;
    try { await api(base, { method: "DELETE" }); router.replace("/autoevaluare"); } catch (e) { setError((e as Error).message); }
  }

  if (loadError) return <PublicShell><Alert>{loadError}</Alert></PublicShell>;
  if (!data) return <PublicShell><LoadingBlock /></PublicShell>;
  const r = data.report;
  const sentTo = new Set(data.requests.map((q) => q.organizationId));
  const canSend = data.emailVerified && r.tools.length > 0 && data.requests.length < data.maxRequests;

  return (
    <PublicShell>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-brand">Autoevaluare AI Act</div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink">{data.companyName}</h1>
          <p className="text-[13px] text-slate-500">{[data.cui && `CUI ${data.cui}`, data.county, `actualizată ${formatDate(data.updatedAt)}`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={!r.tools.length}>Tipărește / PDF</Button>
        </div>
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!data.emailVerified && (
        <div className="mb-4 print:hidden">
          <Alert kind="warning">
            Confirmați adresa <b>{data.contactEmail}</b> cu linkul primit pe email — după confirmare puteți trimite autoevaluarea unui cabinet. Puteți completa autoevaluarea și înainte.{" "}
            {resent ? <span className="font-semibold">Am retrimis emailul.</span> : <button type="button" onClick={resend} className="font-semibold underline">Retrimite emailul</button>}
          </Alert>
        </div>
      )}

      {/* 1. instrumentele */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">1. Instrumentele AI folosite în firmă</h2>
          {!adding && <Button size="sm" className="print:hidden" onClick={() => setAdding(true)}>Adaugă un instrument</Button>}
        </div>
        {!r.tools.length && !adding && <p className="mt-2 text-[13px] text-slate-500">Adăugați fiecare instrument cu inteligență artificială folosit în firmă: ChatGPT sau Copilot, un chatbot pe site, un program de recrutare, camere inteligente...</p>}
        {adding && (
          <form onSubmit={addTool} className="mt-4 space-y-3 rounded-lg border border-slate-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Numele instrumentului"><input className={inputClass} required minLength={2} placeholder="ex. ChatGPT, chatbot site" value={tool.name} onChange={(e) => setTool({ ...tool, name: e.target.value })} /></Field>
              <Field label="Furnizor (opțional)"><input className={inputClass} placeholder="ex. OpenAI, Microsoft" value={tool.vendor} onChange={(e) => setTool({ ...tool, vendor: e.target.value })} /></Field>
            </div>
            <Field label="La ce îl folosiți? (opțional)"><input className={inputClass} value={tool.purpose} onChange={(e) => setTool({ ...tool, purpose: e.target.value })} /></Field>
            <div>
              {PORTAL_QUESTIONS.map((q) => <YesNo key={q.key} label={q.label} help={q.help} value={answers[q.key]} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />)}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => { setAdding(false); setTool(EMPTY_TOOL); setAnswers(EMPTY_PORTAL_ANSWERS); }}>Renunță</Button>
              <Button type="submit" loading={busy}>Salvează instrumentul</Button>
            </div>
          </form>
        )}
      </Card>

      {/* 2. rezultatul */}
      {r.tools.length > 0 && (
        <Card className="mt-5 p-5">
          <h2 className="text-[15px] font-semibold text-ink">2. Rezultatul orientativ</h2>
          {r.needsLawyer
            ? <div className="mt-3"><Alert kind="warning">Cel puțin un instrument are risc ridicat sau cere o analiză juridică. Vă recomandăm să alegeți un cabinet de avocatură (pasul 3).</Alert></div>
            : <p className="mt-1 text-[13px] text-slate-600">Din răspunsuri, instrumentele nu par să aibă obligații complexe. Puteți aplica singuri măsurile de mai jos.</p>}
          <ul className="mt-4 divide-y divide-slate-100">
            {r.tools.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} className="text-left text-[14px] font-semibold text-ink hover:underline">{t.name}</button>
                  {t.vendor && <span className="text-[12px] text-slate-500">{t.vendor}</span>}
                  <VerdictBadge v={t.result.verdict} />
                  <button type="button" className="ml-auto text-[12px] text-slate-500 hover:text-red-700 print:hidden" onClick={() => confirm(`Eliminați „${t.name}”?`) && call(`/tools/${t.id}`, "DELETE")}>Elimină</button>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{t.result.summary}</p>
                {t.result.lawyerReason && <p className="mt-1 text-[12px] font-medium text-amber-800">{t.result.lawyerReason}</p>}
                {(open === t.id) && t.result.obligations.length > 0 && <Obligations items={t.result.obligations} />}
                {open !== t.id && t.result.obligations.length > 0 && <button type="button" onClick={() => setOpen(t.id)} className="mt-1 text-[12px] font-semibold text-brand hover:underline print:hidden">Vezi {t.result.obligations.length} {t.result.obligations.length === 1 ? "obligație" : "obligații"}</button>}
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-[13px] font-semibold text-ink">Obligațiile generale ale firmei</h3>
          <Obligations items={r.general} />
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">{SELF_ASSESSMENT_DISCLAIMER}</p>
        </Card>
      )}

      {/* 3. cabinetul */}
      <Card className="mt-5 p-5 print:hidden">
        <h2 className="text-[15px] font-semibold text-ink">3. Alegeți un cabinet de avocatură (opțional)</h2>
        <p className="mt-1 text-[13px] text-slate-600">Cabinetul primește autoevaluarea gata completată și vă contactează. Puteți trimite la cel mult {data.maxRequests} cabinete.</p>
        {data.requests.length > 0 && (
          <ul className="mt-3 space-y-2">
            {data.requests.map((q) => (
              <li key={q.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-ink">{q.cabinetName}</b>
                  <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", q.status === "acceptat" ? "bg-emerald-50 text-emerald-800" : q.status === "respins" ? "bg-slate-100 text-slate-600" : "bg-sky-50 text-sky-800")}>{STATUS_LABEL[q.status]}</span>
                </div>
                <div className="text-[12px] text-slate-500">Trimisă {formatDate(q.createdAt)}{q.cabinetEmail && <> · contact: <a className="text-brand hover:underline" href={`mailto:${q.cabinetEmail}`}>{q.cabinetEmail}</a></>}</div>
                {q.responseMessage && <p className="mt-1 text-[12px] italic text-slate-600">„{q.responseMessage}”</p>}
              </li>
            ))}
          </ul>
        )}
        {!r.tools.length && <p className="mt-3 text-[12px] text-slate-500">Adăugați mai întâi cel puțin un instrument.</p>}
        {r.tools.length > 0 && !data.emailVerified && <p className="mt-3 text-[12px] font-medium text-amber-800">Confirmați adresa de email ca să puteți trimite autoevaluarea.</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select className={`${inputClass} sm:w-56`} value={county} onChange={(e) => setCounty(e.target.value)} aria-label="Județul cabinetului">
            <option value="">Toate județele</option>
            {(counties.length ? counties : [...JUDETE]).map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          <input className={inputClass} placeholder="Caută după numele cabinetului..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Caută cabinet după nume" />
        </div>
        {!cabinets ? <LoadingBlock /> : cabinets.data.length === 0 ? (
          <p className="mt-4 text-[13px] text-slate-500">Niciun cabinet {county ? `din ${county} ` : ""}nu corespunde căutării.{county ? " Încercați „Toate județele”." : ""}</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {cabinets.data.map((cab) => (
              <li key={cab.id} className="flex flex-col rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-3">
                  {cab.logoSrc
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={cab.logoSrc} alt="" className="h-9 w-9 rounded-lg border border-slate-100 object-contain" />
                    : <div className="flex h-9 w-9 items-center justify-center rounded-lg text-[12px] font-bold text-white" style={{ background: cab.brandColor || "#7a1f3a" }}>{cab.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>}
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-ink">{cab.name}</div>
                    <div className="text-[12px] text-slate-500">{[cab.city, cab.county].filter(Boolean).join(", ")}</div>
                  </div>
                </div>
                {cab.description && <p className="mt-2 flex-1 text-[12px] leading-relaxed text-slate-600">{cab.description}</p>}
                <div className="mt-3 flex items-center justify-between gap-2">
                  {cab.website ? <a href={cab.website} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-[12px] text-brand hover:underline">{cab.website.replace(/^https?:\/\//, "")}</a> : <span />}
                  {sentTo.has(cab.id)
                    ? <span className="text-[12px] font-semibold text-emerald-800">Trimis</span>
                    : <Button size="sm" disabled={!canSend} onClick={() => setChosen(cab)}>Trimite autoevaluarea</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {cabinets && cabinets.total > cabinets.data.length && <p className="mt-2 text-[12px] text-slate-500">Se afișează {cabinets.data.length} din {cabinets.total}. Restrângeți căutarea după județ sau nume.</p>}
      </Card>

      <div className="mt-6 flex flex-wrap justify-between gap-2 text-[12px] text-slate-500 print:hidden">
        <span>Păstrați linkul acestei pagini (l-am trimis și pe email la {data.contactEmail}).</span>
        <button type="button" onClick={removeAll} className="font-medium text-slate-500 underline hover:text-red-700">Șterge autoevaluarea</button>
      </div>

      <Modal open={!!chosen} onClose={() => setChosen(null)} title={`Trimiteți autoevaluarea către ${chosen?.name ?? ""}`}>
        <form onSubmit={send} className="space-y-4">
          <p className="text-[13px] text-slate-600">Cabinetul va primi: denumirea firmei{data.cui ? " și CUI-ul" : ""}, numele și emailul dumneavoastră, instrumentele introduse cu răspunsurile și rezultatul orientativ, plus mesajul de mai jos.</p>
          <Field label="Mesaj pentru cabinet (opțional)"><textarea className={textareaClass} rows={3} maxLength={2000} placeholder="ex. Ne interesează o ofertă până la sfârșitul lunii." value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <label className="flex items-start gap-2 text-[12px] text-slate-600">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>Sunt de acord ca datele de mai sus să fie transmise cabinetului {chosen?.name}, care le va folosi pentru a mă contacta și a analiza solicitarea.</span>
          </label>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setChosen(null)}>Renunță</Button>
            <Button type="submit" loading={busy}>Trimite</Button>
          </div>
        </form>
      </Modal>
    </PublicShell>
  );
}
