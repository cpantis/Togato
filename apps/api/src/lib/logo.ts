import type { organizations } from "../db/schema";

/** adresa logo-ului afișat: fișierul încărcat (servit public) sau adresa externă configurată */
export function logoSrc(o: Pick<typeof organizations.$inferSelect, "id" | "logoKey" | "logoUrl">): string | null {
  if (o.logoKey) return `/api/public/logo/${o.id}?v=${o.logoKey.slice(-8)}`;
  return o.logoUrl ?? null;
}
