export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("ro-RO");
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/** Zile până la o dată YYYY-MM-DD (negativ = în trecut). */
export function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`).getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / 86400_000);
}
