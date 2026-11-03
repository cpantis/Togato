"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, inputClass } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api<{ message: string }>("/api/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) });
      setDone(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Resetarea parolei" subtitle="Vă trimitem pe email un link valabil 60 de minute." footer={<Link href="/login" className="font-semibold text-brand hover:underline">Înapoi la autentificare</Link>}>
      {done ? (
        <Alert kind="info">{done}</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email">
            <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>Trimite linkul</Button>
        </form>
      )}
    </AuthLayout>
  );
}
