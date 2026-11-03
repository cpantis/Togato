"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, inputClass } from "@/components/ui";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Parolele nu coincid."); return; }
    setBusy(true); setError(null);
    try {
      await api("/api/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Parolă nouă" subtitle="După schimbare, toate sesiunile deschise se închid." footer={<Link href="/login" className="font-semibold text-brand hover:underline">Înapoi la autentificare</Link>}>
      {done ? (
        <div className="space-y-4">
          <Alert kind="info">Parola a fost schimbată. Autentificați-vă cu parola nouă.</Alert>
          <Link href="/login" className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white hover:bg-brand-dark">Autentificare</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Parola nouă" hint="Cel puțin 8 caractere.">
            <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirmați parola">
            <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>Salvează parola</Button>
        </form>
      )}
    </AuthLayout>
  );
}
