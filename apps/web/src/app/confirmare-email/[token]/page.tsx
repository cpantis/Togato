"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, LoadingBlock } from "@/components/ui";

export default function ConfirmEmailPage() {
  const { token } = useParams<{ token: string }>();
  const { refresh } = useAuth();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => { setState("ok"); void refresh(); })
      .catch((e) => { setError(e.message); setState("error"); });
  }, [token, refresh]);

  return (
    <AuthLayout title="Confirmarea adresei de email" subtitle="Ultimul pas înainte de a folosi Togato." footer={<Link href="/dashboard" className="font-semibold text-brand hover:underline">Mergi la panou</Link>}>
      {state === "loading" && <LoadingBlock />}
      {state === "ok" && <Alert kind="info">Adresa a fost confirmată. Puteți începe să lucrați.</Alert>}
      {state === "error" && <Alert>{error}</Alert>}
    </AuthLayout>
  );
}
