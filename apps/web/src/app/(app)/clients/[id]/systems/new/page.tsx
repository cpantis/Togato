"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { AiSystem } from "@togato/shared";
import { apiPost } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { EMPTY_SYSTEM, SystemForm } from "@/components/SystemForm";

export default function NewSystemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return (
    <div className="fade-up">
      <Link href={`/clients/${id}`} className="mb-3 inline-block text-[13px] text-slate-500 hover:text-brand">‹ Înapoi la client</Link>
      <PageHeader title="Sistem AI nou" subtitle="Răspunde la întrebări; încadrarea se actualizează pe loc." />
      <SystemForm
        initial={EMPTY_SYSTEM}
        submitLabel="Salvează și generează obligațiile"
        onCancel={() => router.push(`/clients/${id}`)}
        onSubmit={async (v) => {
          const created = await apiPost<AiSystem>(`/api/clients/${id}/ai-systems`, v);
          router.replace(`/systems/${created.id}`);
        }}
      />
    </div>
  );
}
