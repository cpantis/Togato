"use client";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";

type Session = { id: string; current: boolean; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string };

function device(ua: string | null): string {
  if (!ua) return "Dispozitiv necunoscut";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} pe ${os}` : browser;
}

/** Parola contului și sesiunile deschise pe alte dispozitive. */
export function AccountSecurityCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  const load = useCallback(() => {
    apiGet<{ data: Session[] }>("/api/account/sessions").then((r) => setSessions(r.data)).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await apiPost("/api/account/password", { currentPassword: current, newPassword: next });
      setCurrent(""); setNext("");
      setMsg({ kind: "info", text: "Parola a fost schimbată. Celelalte sesiuni au fost închise." });
      load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id?: string) {
    try {
      if (id) await apiDelete(`/api/account/sessions/${id}`);
      else await apiPost("/api/account/sessions/revoke-others");
      load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  const others = sessions.filter((s) => !s.current);
  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Parolă și sesiuni</h2>
      {msg && <div className="mt-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      <form onSubmit={changePassword} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Parola actuală"><input className={inputClass} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="Parola nouă"><input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Button type="submit" size="sm" loading={busy}>Schimbă parola</Button></div>
      </form>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[13px] font-semibold text-ink">Sesiuni active</div>
          {others.length > 0 && <Button size="sm" variant="secondary" onClick={() => revoke()}>Ieșire de pe celelalte</Button>}
        </div>
        <ul className="mt-2 divide-y divide-slate-100">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
              <div className="min-w-0">
                <div className="font-medium text-slate-700">{device(s.userAgent)}{s.current && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">această sesiune</span>}</div>
                <div className="text-slate-400">{s.ip ?? "IP necunoscut"} · activ {formatDate(s.lastSeenAt)}</div>
              </div>
              {!s.current && <Button size="sm" variant="ghost" onClick={() => revoke(s.id)} aria-label="Închide sesiunea">Închide</Button>}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
