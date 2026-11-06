"use client";
import { useState } from "react";
import { Captcha } from "@/components/Captcha";
import Link from "next/link";
import { api } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";

export default function SelfAssessmentRecovery() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ message: string }>("/api/self-assessment-recovery", { method: "POST", body: JSON.stringify({ email, captchaToken: captcha ?? undefined }) });
      setDone(r.message);
    } catch (err) {
      setError((err as Error).message);
      setCaptcha(null); setCaptchaKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicShell>
      <Card className="mx-auto max-w-md p-6">
        <h1 className="text-[20px] font-bold tracking-tight text-ink">Primiți din nou linkul autoevaluării</h1>
        <p className="mt-1 text-[13px] text-slate-600">Introduceți adresa folosită la autoevaluare. Vă trimitem linkuri noi către toate autoevaluările făcute cu ea; linkurile vechi nu vor mai funcționa.</p>
        {done ? (
          <div className="mt-4"><Alert kind="info">{done}</Alert></div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {error && <Alert>{error}</Alert>}
            <Field label="Email"><input className={inputClass} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Captcha key={captchaKey} onToken={setCaptcha} />
            <Button type="submit" className="w-full" loading={busy}>Trimite linkurile</Button>
          </form>
        )}
        <p className="mt-4 text-center text-[12px]"><Link href="/autoevaluare" className="font-semibold text-brand hover:underline">Începeți o autoevaluare nouă</Link></p>
      </Card>
    </PublicShell>
  );
}
