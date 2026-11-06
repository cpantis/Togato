import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_TEXTS } from "@/content/legal";

export const metadata: Metadata = { title: `${LEGAL_TEXTS["confidentialitate"].title} — Togato` };
export default function Page() {
  return <LegalPage code="confidentialitate" />;
}
