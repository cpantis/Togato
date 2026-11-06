"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card } from "@/components/ui";

interface SystemStatus {
  checkedAt: string;
  queue: { pending: number; running: number; overdue: number; oldestOverdueMinutes: number | null; failedLastHour: number; failedLast24h: number; failedByType: Record<string, number> };
  daily: Record<string, string | null>;
  backup: { lastOkAt: string | null; lastFailedAt: string | null; ageHours: number | null; expected: boolean };
  emailSuppressions: number;
  problems: string[];
}

const DAILY_LABELS: Record<string, string> = { "reminders.daily": "Rezumatul termenelor", "maintenance.prune": "Curățenie", "trial.reminders": "Final de probă", "closure.daily": "Închideri și păstrare" };

/** Starea operațională a platformei (coada de joburi, joburile zilnice, backup-ul). */
export function SystemStatusCard() {
  const [s, setS] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => apiGet<SystemStatus>("/api/platform/status").then(setS).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <Card className="mb-5 p-5" >
      <div id="stare" className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-ink">Starea sistemului</h2>
        <Button size="sm" variant="ghost" onClick={load}>Reîmprospătează</Button>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {s && (
        <>
          <div className="mt-3">
            {s.problems.length
              ? <Alert kind="warning">{s.problems.map((p) => <div key={p}>{p}</div>)}</Alert>
              : <Alert kind="info">Nicio problemă detectată. Verificat la {new Date(s.checkedAt).toLocaleTimeString("ro-RO")}.</Alert>}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-4">
            <div><dt className="text-slate-500">Joburi în așteptare</dt><dd className="font-semibold text-ink">{s.queue.pending} ({s.queue.overdue} întârziate)</dd></div>
            <div><dt className="text-slate-500">Eșuate (24 h)</dt><dd className="font-semibold text-ink">{s.queue.failedLast24h}</dd></div>
            <div><dt className="text-slate-500">Ultimul backup</dt><dd className="font-semibold text-ink">{s.backup.lastOkAt ? `${formatDate(s.backup.lastOkAt)} (acum ${s.backup.ageHours} h)` : "—"}</dd></div>
            <div><dt className="text-slate-500">Adrese de email blocate</dt><dd className="font-semibold text-ink">{s.emailSuppressions}</dd></div>
            {Object.entries(s.daily).map(([k, v]) => (
              <div key={k}><dt className="text-slate-500">{DAILY_LABELS[k] ?? k}</dt><dd className="font-semibold text-ink">{v ? new Date(v).toLocaleString("ro-RO") : "—"}</dd></div>
            ))}
          </dl>
        </>
      )}
    </Card>
  );
}
