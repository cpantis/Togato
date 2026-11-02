"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, inputClass } from "@/components/ui";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) router.replace("/dashboard"); }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
        <Button type="submit" className="w-full" loading={busy}>Intră în cont</Button>
      </form>
    </AuthLayout>
  );
}
