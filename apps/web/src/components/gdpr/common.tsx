"use client";
import type { GdprOption } from "@togato/shared";
import { cn } from "@/components/ui";

/** listă de opțiuni bifabile, cu explicații */
export function CheckList({ label, options, value, onChange, columns = 1 }: { label: string; options: GdprOption[]; value: string[]; onChange: (v: string[]) => void; columns?: 1 | 2 }) {
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium text-slate-700">{label}</legend>
      <div className={cn("grid gap-1", columns === 2 && "sm:grid-cols-2")}>
        {options.map((o) => (
          <label key={o.code} className="flex items-start gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-slate-50">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand" checked={value.includes(o.code)} onChange={() => toggle(o.code)} />
            <span className="text-slate-700">{o.label}{o.help && <span className="block text-[12px] text-slate-500">{o.help}</span>}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Pill({ tone, children }: { tone: "red" | "amber" | "green" | "slate" | "sky"; children: React.ReactNode }) {
  const t = { red: "bg-red-50 text-red-800", amber: "bg-amber-50 text-amber-800", green: "bg-emerald-50 text-emerald-800", slate: "bg-slate-100 text-slate-700", sky: "bg-sky-50 text-sky-800" }[tone];
  return <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", t)}>{children}</span>;
}

/** valoare pentru <input type="datetime-local"> din ISO (ora locală) */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function fmtDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("ro-RO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

/** timpul rămas până la un termen, pe scurt */
export function remaining(iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.round(Math.abs(ms) / 3600_000);
  const text = h > 72 ? `${Math.round(h / 24)} zile` : `${h} ore`;
  return ms < 0 ? { text: `depășit cu ${text}`, overdue: true } : { text: `mai sunt ${text}`, overdue: false };
}
