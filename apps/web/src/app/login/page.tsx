"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, inputClass } from "@/components/ui";

export default function LoginPage() {
  const { login, completeMfa, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) router.replace("/dashboard"); }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const step = await login(email, password);
      if (step) {
        setMfaToken(step.mfaToken);
        return;
      }
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await completeMfa(mfaToken, code);
      if (res.recoveryCodesLeft !== undefined) {
        try { sessionStorage.setItem("togato-recovery-left", String(res.recoveryCodesLeft)); } catch { /* ignorat */ }
      }
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      if (/expirat/i.test((err as Error).message)) { setMfaToken(null); setCode(""); }
    } finally {
      setBusy(false);
    }
  }

  if (mfaToken) {
    return (
      <AuthLayout title="Cod de verificare" subtitle="Introduceți codul de 6 cifre din aplicația de autentificare." footer={<button onClick={() => { setMfaToken(null); setCode(""); setError(null); }} className="font-semibold text-brand hover:underline">Înapoi la autentificare</button>}>
        <form onSubmit={submitCode} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Cod" hint="Ați pierdut telefonul? Folosiți unul dintre codurile de recuperare (XXXXX-XXXXX).">
            <input className={`${inputClass} text-center font-mono text-lg tracking-[0.3em]`} inputMode="text" autoComplete="one-time-code" autoFocus required maxLength={11} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Cod de verificare" />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>Verifică</Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Autentificare" subtitle="Intră în contul cabinetului tău." footer={<>Nu ai cont? <Link href="/signup" className="font-semibold text-brand hover:underline">Creează un cont de cabinet</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Email">
          <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Parolă">
          <input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="-mt-2 text-right"><Link href="/forgot" className="text-[12px] font-medium text-brand hover:underline">Ați uitat parola?</Link></div>
        <Button type="submit" className="w-full" loading={busy}>Intră în cont</Button>
      </form>
    </AuthLayout>
  );
}
