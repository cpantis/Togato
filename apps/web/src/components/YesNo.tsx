"use client";
/** Întrebare cu răspuns Da / Nu (butoane mari, ușor de atins pe telefon). */
export function YesNo({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between" role="group" aria-label={label}>
      <div className="min-w-0">
        <div className="text-[14px] text-slate-800">{label}</div>
        {help && <div className="text-[12px] text-slate-500">{help}</div>}
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200">
        {[true, false].map((v) => (
          <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
            className={`px-5 py-1.5 text-[13px] font-semibold transition ${value === v ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
            {v ? "Da" : "Nu"}
          </button>
        ))}
      </div>
    </div>
  );
}
