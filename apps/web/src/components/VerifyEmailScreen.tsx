"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Button, Card, Logo } from "@/components/ui";

/** Contul nou e folosibil după confirmarea adresei de email. */
export function VerifyEmailScreen() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function resend() {
    setError(null);
    try { const r = await apiPost<{ verified: boolean }>("/api/account/resend-verification"); if (r.verified) await refresh(); else setSent(true); }
    catch (e) { setError((e as Error).message); }
  }
  return (
    <div className="flex min-h-screen items-start justify-center bg-[#f6f7f9] px-4 py-12">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center gap-3"><Logo size={32} /><span className="text-lg font-bold tracking-tight">Togato</span></div>
        <Card className="p-6">
          <h1 className="text-[20px] font-bold tracking-tight text-ink">Confirmați adresa de email</h1>
          <p className="mt-2 text-[14px] text-slate-600">Am trimis un link de confirmare la <b>{user?.email}</b>. Deschideți-l ca să începeți să folosiți contul. Verificați și dosarul Spam.</p>
          {sent && <div className="mt-3"><Alert kind="info">Am retrimis emailul.</Alert></div>}
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={resend}>Retrimite emailul</Button>
            <Button variant="ghost" onClick={() => refresh()}>Am confirmat</Button>
            <Button variant="ghost" onClick={async () => { await logout(); router.replace("/login"); }}>Ieșire</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
