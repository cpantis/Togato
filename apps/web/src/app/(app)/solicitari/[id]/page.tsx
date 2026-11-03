"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PORTAL_QUESTIONS, SELF_VERDICT_LABELS, type Referral } from "@togato/shared";
import { apiGet, apiPost } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, Field, LoadingBlock, PageHeader, textareaClass } from "@/components/ui";

export default function ReferralPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Referral | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  useEffect(() => { apiGet<Referral>(`/api/referrals/${id}`).then(setR).catch((e) => setError(e.message)); }, [id]);

  async function answer(kind: "accept" | "decline") {
    if (kind === "decline" && !confirm("Refuzați solicitarea? Firma va fi anunțată și poate alege alt cabinet.")) return;
    setBusy(kind); setError(null);
    try {
      const res = await apiPost<Referral & { clientId?: string }>(`/api/referrals/${id}/${kind}`, { message: reply || null });
      if (kind === "accept" && res.clientId) router.push(`/clients/${res.clientId}`);
      else setR(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !r) return <Alert>{error}</Alert>;
  if (!r) return <LoadingBlock />;

  return (
    <div className="fade-up">
      <Link href="/solicitari" className="mb-3 inline-block text-[13px] text-slate-500 hover:text-brand">‹ Solicitări</Link>
      <PageHeader title={r.company.name} subtitle={[r.company.cui && `CUI ${r.company.cui}`, r.company.county, `primită ${formatDate(r.createdAt)}`].filter(Boolean).join(" · ")} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {r.message && <Card className="p-5"><h2 className="text-[14px] font-semibold text-ink">Mesajul firmei</h2><p className="mt-1 whitespace-pre-line text-[13px] text-slate-700">{r.message}</p></Card>}
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-ink">Instrumentele declarate ({r.tools.length})</h2>
            <p className="mt-1 text-[12px] text-slate-500">Rezultatul e cel orientativ, văzut de firmă. După acceptare, instrumentele intră în inventarul clientului cu încadrarea propusă, de verificat.</p>
            <ul className="mt-3 space-y-4">
              {r.tools.map((t) => (
                <li key={t.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[14px] text-ink">{t.name}</b>
                    {t.vendor && <span className="text-[12px] text-slate-500">{t.vendor}</span>}
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{SELF_VERDICT_LABELS[t.result.verdict]}</span>
                  </div>
                  {t.purpose && <p className="mt-1 text-[12px] text-slate-600">Folosit pentru: {t.purpose}</p>}
                  {t.result.lawyerReason && <p className="mt-1 text-[12px] font-medium text-amber-800">{t.result.lawyerReason}</p>}
                  <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-2">
                    {PORTAL_QUESTIONS.filter((q) => t.answers[q.key]).map((q) => <li key={q.key} className="text-slate-700">✓ {q.label}</li>)}
                    {PORTAL_QUESTIONS.every((q) => !t.answers[q.key]) && <li className="text-slate-500">Niciun răspuns „Da”.</li>}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-ink">Persoana de contact</h2>
            <p className="mt-1 text-[13px] text-slate-700">{r.contact.name}<br /><a className="text-brand hover:underline" href={`mailto:${r.contact.email}`}>{r.contact.email}</a></p>
          </Card>
          <Card className="p-5">
            {r.status === "nou" ? (
              <>
                <h2 className="text-[14px] font-semibold text-ink">Răspuns</h2>
                <p className="mt-1 text-[12px] text-slate-500">Acceptarea creează clientul (sau completează clientul cu același CUI) și vă desemnează responsabil. Firma primește un email.</p>
                <div className="mt-3"><Field label="Mesaj pentru firmă (opțional)"><textarea className={textareaClass} rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="ex. Vă contactăm mâine pentru o ofertă." /></Field></div>
                {error && <div className="mt-3"><Alert>{error}</Alert></div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button loading={busy === "accept"} disabled={!!busy} onClick={() => answer("accept")}>Acceptă și creează clientul</Button>
                  <Button variant="secondary" loading={busy === "decline"} disabled={!!busy} onClick={() => answer("decline")}>Refuză</Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[14px] font-semibold text-ink">{r.status === "acceptat" ? "Acceptată" : "Refuzată"}{r.respondedAt ? ` la ${formatDate(r.respondedAt)}` : ""}</h2>
                {r.responseMessage && <p className="mt-1 text-[12px] italic text-slate-600">„{r.responseMessage}”</p>}
                {r.clientId && <Link href={`/clients/${r.clientId}`} className="mt-3 inline-block text-[13px] font-semibold text-brand hover:underline">Deschide clientul ›</Link>}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
