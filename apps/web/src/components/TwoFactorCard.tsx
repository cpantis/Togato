"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";

interface Security { totpEnabled: boolean; totpEnabledAt: string | null; recoveryCodesLeft: number; orgRequires2fa: boolean }

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `Togato — coduri de recuperare\nFiecare cod se poate folosi o singură dată.\n\n${codes.join("\n")}\n`;
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "togato-coduri-recuperare.txt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
  }
  return (
    <div className="space-y-3">
      <Alert kind="warning">Păstrați aceste coduri într-un loc sigur. Fiecare permite o singură autentificare dacă pierdeți telefonul. <b>Nu vor mai fi afișate.</b></Alert>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 font-mono text-[13px] text-ink">
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={download}>Descarcă (.txt)</Button>
        <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(codes.join("\n")); setSaved(true); }}>Copiază</Button>
        <Button size="sm" onClick={onDone} disabled={!saved}>Le-am salvat</Button>
      </div>
    </div>
  );
}

/** Autentificarea în doi pași pentru contul propriu: activare (QR), coduri de recuperare, dezactivare. */
export function TwoFactorCard({ onEnabled }: { onEnabled?: () => void }) {
  const { refresh } = useAuth();
  const [sec, setSec] = useState<Security | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"none" | "disable" | "regen">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => { apiGet<Security>("/api/account/security").then(setSec).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const start = () => run(async () => { setSetup(await apiPost("/api/account/2fa/setup")); setCode(""); });
  const enable = () => run(async () => {
    const r = await apiPost<{ recoveryCodes: string[] }>("/api/account/2fa/enable", { code });
    setCodes(r.recoveryCodes); setSetup(null); setCode("");
  });
  const disable = () => run(async () => {
    await apiPost("/api/account/2fa/disable", { password, code });
    setMode("none"); setPassword(""); setCode(""); load(); refresh();
  });
  const regen = () => run(async () => {
    const r = await apiPost<{ recoveryCodes: string[] }>("/api/account/2fa/recovery-codes", { code });
    setCodes(r.recoveryCodes); setMode("none"); setCode("");
  });

  if (!sec) return <Card className="p-5"><div className="text-[13px] text-slate-400">{error ?? "Se încarcă..."}</div></Card>;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-ink">Autentificare în doi pași</h2>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${sec.totpEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{sec.totpEnabled ? "Activă" : "Inactivă"}</span>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">La autentificare, pe lângă parolă, se cere un cod din aplicația de pe telefon (Google Authenticator, Microsoft Authenticator, 1Password etc.).</p>
      {sec.orgRequires2fa && !sec.totpEnabled && <div className="mt-3"><Alert kind="warning">Cabinetul cere autentificarea în doi pași pentru toți membrii. Activați-o pentru a continua.</Alert></div>}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}

      {codes ? (
        <div className="mt-4"><RecoveryCodes codes={codes} onDone={() => { setCodes(null); load(); refresh(); onEnabled?.(); }} /></div>
      ) : !sec.totpEnabled ? (
        setup ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="Cod QR pentru aplicația de autentificare" className="h-[200px] w-[200px] rounded-lg border border-slate-200" />
            <div className="space-y-3">
              <ol className="list-decimal space-y-1 pl-4 text-[13px] text-slate-600">
                <li>Deschideți aplicația de autentificare și scanați codul QR.</li>
                <li>Introduceți codul de 6 cifre afișat de aplicație.</li>
              </ol>
              <p className="text-[12px] text-slate-500">Nu puteți scana? Introduceți manual cheia: <code className="break-all rounded bg-slate-100 px-1 font-mono text-[11px]">{setup.secret}</code></p>
              <Field label="Cod din aplicație">
                <input className={`${inputClass} font-mono tracking-widest`} inputMode="numeric" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Cod din aplicație" />
              </Field>
              <div className="flex gap-2">
                <Button size="sm" onClick={enable} loading={busy} disabled={code.replace(/\s/g, "").length !== 6}>Activează</Button>
                <Button size="sm" variant="ghost" onClick={() => setSetup(null)}>Renunță</Button>
              </div>
            </div>
          </div>
        ) : (
          <Button size="sm" className="mt-4" onClick={start} loading={busy}>Configurează</Button>
        )
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-[12px] text-slate-500">Coduri de recuperare rămase: <b className={sec.recoveryCodesLeft <= 2 ? "text-red-600" : "text-slate-700"}>{sec.recoveryCodesLeft}</b></p>
          {mode === "none" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setMode("regen"); setError(null); }}>Coduri de recuperare noi</Button>
              {!sec.orgRequires2fa && <Button size="sm" variant="ghost" onClick={() => { setMode("disable"); setError(null); }}>Dezactivează</Button>}
            </div>
          )}
          {mode !== "none" && (
            <div className="space-y-3 rounded-lg bg-slate-50 p-3">
              {mode === "disable" && <Field label="Parola"><input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
              <Field label="Cod din aplicație sau cod de recuperare"><input className={`${inputClass} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Cod de confirmare" /></Field>
              <div className="flex gap-2">
                <Button size="sm" variant={mode === "disable" ? "danger" : "primary"} loading={busy} onClick={mode === "disable" ? disable : regen}>{mode === "disable" ? "Dezactivează" : "Generează coduri noi"}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setMode("none"); setCode(""); setPassword(""); }}>Renunță</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
