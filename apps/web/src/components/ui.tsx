"use client";
import { useEffect } from "react";
import { OBLIGATION_STATUS_LABELS, REVIEW_STATUS_LABELS, RISK_LABELS, type ObligationStatus, type ReviewStatus, type RiskLevel } from "@togato/shared";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark shadow-sm",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  }[variant];
  const sizes = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm";
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed", styles, sizes, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-[13px] text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const RISK_STYLES: Record<RiskLevel | "neclasificat", string> = {
  interzis: "bg-red-50 text-red-800 border-red-200",
  risc_ridicat: "bg-orange-50 text-orange-800 border-orange-200",
  transparenta: "bg-sky-50 text-sky-800 border-sky-200",
  minim: "bg-emerald-50 text-emerald-800 border-emerald-200",
  neclasificat: "bg-slate-50 text-slate-500 border-slate-200",
  neaplicabil: "bg-white text-slate-500 border-dashed border-slate-300",
};

export function RiskBadge({ level, className }: { level: RiskLevel | "neclasificat"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap", RISK_STYLES[level], className)}>
      {RISK_LABELS[level]}
    </span>
  );
}

const REVIEW_STYLES: Record<ReviewStatus, string> = {
  propus: "text-amber-800 bg-amber-50",
  aprobat: "text-emerald-800 bg-emerald-50",
  respins: "text-red-800 bg-red-50",
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", REVIEW_STYLES[status])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "aprobat" ? "bg-emerald-500" : status === "respins" ? "bg-red-500" : "bg-amber-500")} />
      {REVIEW_STATUS_LABELS[status]}
    </span>
  );
}

const OBL_STYLES: Record<ObligationStatus, string> = {
  de_facut: "bg-slate-100 text-slate-600",
  in_lucru: "bg-blue-50 text-blue-800",
  indeplinit: "bg-emerald-50 text-emerald-800",
  nu_se_aplica: "bg-slate-50 text-slate-500 line-through",
};

export function ObligationStatusSelect({ value, onChange, disabled }: { value: ObligationStatus; onChange: (v: ObligationStatus) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ObligationStatus)}
      className={cn("h-8 rounded-md border-0 px-2 text-[12px] font-semibold cursor-pointer", OBL_STYLES[value])}
      aria-label="Stare obligație"
    >
      {(Object.keys(OBLIGATION_STATUS_LABELS) as ObligationStatus[]).map((s) => (
        <option key={s} value={s}>{OBLIGATION_STATUS_LABELS[s]}</option>
      ))}
    </select>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12px] tabular-nums text-slate-500 whitespace-nowrap">{done}/{total}</span>
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[12px] text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-[12px] text-red-600">{error}</span>}
    </label>
  );
}

export const inputClass = "w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-ink placeholder:text-slate-400";
export const textareaClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400";

export function Alert({ kind = "error", children }: { kind?: "error" | "info" | "warning"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-700",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[kind];
  return <div className={cn("rounded-lg border px-3 py-2 text-[13px]", styles)} role={kind === "error" ? "alert" : undefined}>{children}</div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("fade-up max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")} role="dialog" aria-modal aria-label={title}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Închide">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 006 0zM17 7l-3 7a3 3 0 006 0z" /></svg>
      </div>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      <p className="mt-1 max-w-sm text-[13px] text-slate-500">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-400">
      <Spinner className="h-4 w-4" /> Se încarcă...
    </div>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-lg bg-brand text-white shadow-sm" style={{ width: size, height: size }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 006 0zM17 7l-3 7a3 3 0 006 0zM8 21h8" />
      </svg>
    </div>
  );
}
