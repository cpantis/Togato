"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LEGAL_VERSION } from "@togato/shared";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, inputClass } from "@/components/ui";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ cabinetName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accept, setAccept] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signup({ ...form, acceptTerms: accept, legalVersion: LEGAL_VERSION });
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Cont nou de cabinet" subtitle="14 zile de probă gratuită, fără card." footer={<>Ai deja cont? <Link href="/login" className="font-semibold text-brand hover:underline">Autentifică-te</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Numele cabinetului">
          <input className={inputClass} required minLength={2} placeholder="ex. Popescu & Asociații" value={form.cabinetName} onChange={set("cabinetName")} />
        </Field>
        <Field label="Numele tău">
          <input className={inputClass} required minLength={2} autoComplete="name" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Parolă" hint="Minimum 8 caractere">
          <input className={inputClass} type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        <label className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-600">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand" required checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>Accept, în numele cabinetului, <Link href="/termeni" target="_blank" className="font-semibold text-brand hover:underline">Termenii și condițiile</Link>, <Link href="/dpa" target="_blank" className="font-semibold text-brand hover:underline">Acordul de prelucrare a datelor</Link> și am citit <Link href="/confidentialitate" target="_blank" className="font-semibold text-brand hover:underline">Politica de confidențialitate</Link>.</span>
        </label>
        <Button type="submit" className="w-full" loading={busy}>Creează contul</Button>
      </form>
    </AuthLayout>
  );
}
