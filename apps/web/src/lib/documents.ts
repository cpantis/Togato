/** Obligațiile pentru care există un model de document generat de Togato */
export const OBLIGATION_DOCUMENTS: Record<string, { type: string; label: string; perSystem: boolean }> = {
  politica_ai: { type: "politica", label: "Politica internă de utilizare AI", perSystem: false },
  art26_7_angajati: { type: "notificare_angajati", label: "Informarea angajaților", perSystem: true },
  art27_fria: { type: "fria", label: "Evaluarea impactului (FRIA)", perSystem: true },
};

export function documentUrl(clientId: string, type: string, systemId?: string | null) {
  return `/api/clients/${clientId}/documents/${type}${systemId ? `?systemId=${encodeURIComponent(systemId)}` : ""}`;
}
