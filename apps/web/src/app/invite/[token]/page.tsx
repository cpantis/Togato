"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, LoadingBlock, inputClass } from "@/components/ui";

interface InvitationInfo { email: string; name: string | null; role: string; cabinetName: string }

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { refresh } = useAuth();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<InvitationInfo>(`/api/auth/invitation/${encodeURIComponent(token)}`)
      .then((d) => { setInfo(d); setName(d.name || ""); })
      .catch((e) => setLoadError(e.message));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api<{ token: string }>("/api/auth/accept-invitation", { method: "POST", body: JSON.stringify({ token, name, password }) });
      setToken(res.token);
      await refresh();
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!info && !loadError) return <LoadingBlock />;

  if (loadError || !info) {
    return (
      <AuthLayout title="Invitație indisponibilă" subtitle="Linkul a expirat, a fost anulat sau a fost deja folosit." footer={<Link href="/login" className="font-semibold text-brand hover:underline">Mergi la autentificare</Link>}>
        <Alert>{loadError}</Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={`Alătură-te cabinetului ${info.cabinetName}`} subtitle={`Ai fost invitat ca ${info.role === "admin" ? "administrator" : "membru"}. Alege-ți o parolă ca să intri.`} footer={<>Ai deja cont? <Link href="/login" className="font-semibold text-brand hover:underline">Autentifică-te</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Email"><input className={inputClass} value={info.email} disabled /></Field>
        <Field label="Numele tău"><input className={inputClass} required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Parolă" hint="Minimum 8 caractere"><input className={inputClass} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" className="w-full" loading={busy}>Creează contul</Button>
      </form>
    </AuthLayout>
  );
}
