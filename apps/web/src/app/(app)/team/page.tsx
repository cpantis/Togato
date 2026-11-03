"use client";
import { useCallback, useEffect, useState } from "react";
import type { TeamData, TeamMember, UserRole } from "@togato/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { formatDate, initials } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Button, Card, Field, LoadingBlock, Modal, PageHeader, cn, inputClass } from "@/components/ui";

const ROLE_LABELS: Record<UserRole, string> = { admin: "Administrator", membru: "Membru" };

function InviteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("membru");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    setEmail(""); setName(""); setRole("membru"); setError(null); setLink(null); setCopied(false);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await apiPost<{ url: string }>("/api/team/invitations", { email, name: name || null, role, sendEmail: true });
      setLink(res.url);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Invită un coleg">
      {link ? (
        <div className="space-y-4">
          <Alert kind="info">Am trimis invitația pe email la <b>{email}</b>. Linkul de mai jos e același — îl puteți trimite și pe alt canal. E valabil 7 zile și poate fi folosit o singură dată.</Alert>
          <div className="flex gap-2">
            <input className={cn(inputClass, "font-mono text-[12px]")} readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Link invitație" />
            <Button type="button" variant="secondary" onClick={copy}>{copied ? "Copiat" : "Copiază"}</Button>
          </div>
          <p className="text-[12px] text-slate-500">Linkul nu se mai poate afișa după ce închizi fereastra. Dacă îl pierzi, creează o invitație nouă.</p>
          <div className="flex justify-end"><Button onClick={close}>Gata</Button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email"><input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Nume (opțional)"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Rol" hint="Administratorii pot invita colegi și pot schimba rolurile.">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="membru">Membru</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>Renunță</Button>
            <Button type="submit" loading={busy}>Creează invitația</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function MemberRow({ m, isAdmin, isSelf, onChanged, onError }: { m: TeamMember; isAdmin: boolean; isSelf: boolean; onChanged: () => void; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function patch(data: { role?: UserRole; status?: "activ" | "dezactivat" }) {
    if (data.status === "dezactivat" && !confirm(`Dezactivezi contul lui ${m.name}? Nu se va mai putea autentifica.`)) return;
    setBusy(true);
    try {
      await apiPatch(`/api/team/members/${m.id}`, data);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const disabled = m.status === "dezactivat";
  return (
    <li className={cn("flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center", disabled && "opacity-60")}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-600">{initials(m.name)}</div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-ink">{m.name}{isSelf && <span className="ml-1.5 text-[12px] font-normal text-slate-400">(tu)</span>}</div>
          <div className="truncate text-[12px] text-slate-500">{m.email}{" "}
            <span className={cn("ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", m.totpEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{m.totpEnabled ? "2FA activ" : "fără 2FA"}</span>
          </div>
        </div>
      </div>
      <div className="text-[12px] text-slate-500 sm:w-28">{m.clientsCount === 1 ? "1 client" : `${m.clientsCount} clienți`}</div>
      <div className="text-[12px] text-slate-500 sm:w-36">{disabled ? <span className="font-medium text-red-600">Dezactivat</span> : m.lastActiveAt ? `Activ ${formatDate(m.lastActiveAt)}` : "Nu s-a autentificat încă"}</div>
      <div className="flex flex-wrap items-center gap-2 sm:w-80 sm:justify-end">
        {isAdmin && !isSelf ? (
          <>
            <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px]" value={m.role} disabled={busy || disabled} onChange={(e) => patch({ role: e.target.value as UserRole })} aria-label={`Rolul lui ${m.name}`}>
              <option value="membru">Membru</option>
              <option value="admin">Administrator</option>
            </select>
            {m.totpEnabled && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
                if (!confirm(`Resetați autentificarea în doi pași pentru ${m.name}? Va trebui să o configureze din nou (ex. după pierderea telefonului).`)) return;
                setBusy(true);
                try { await apiPost(`/api/team/members/${m.id}/reset-2fa`); onChanged(); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
              }}>Resetează 2FA</Button>
            )}
            <Button size="sm" variant={disabled ? "secondary" : "ghost"} disabled={busy} onClick={() => patch({ status: disabled ? "activ" : "dezactivat" })}>
              {disabled ? "Reactivează" : "Dezactivează"}
            </Button>
          </>
        ) : (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-[12px] font-medium text-slate-600">{ROLE_LABELS[m.role]}</span>
        )}
      </div>
    </li>
  );
}

export default function TeamPage() {
  const { user } = useAuth();
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const isAdmin = user?.role === "admin";

  const load = useCallback(() => {
    apiGet<TeamData>("/api/team").then((d) => { setData(d); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function revoke(id: string, email: string) {
    if (!confirm(`Anulezi invitația pentru ${email}?`)) return;
    try {
      await apiDelete(`/api/team/invitations/${id}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) return error ? <Alert>{error}</Alert> : <LoadingBlock />;

  return (
    <div className="fade-up">
      <PageHeader title="Echipă" subtitle="Colegii care lucrează în contul cabinetului." actions={isAdmin && <Button onClick={() => setInvite(true)}>Invită un coleg</Button>} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-ink">Membri</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {data.members.map((m) => (
            <MemberRow key={m.id} m={m} isAdmin={isAdmin} isSelf={m.id === user?.id} onChanged={() => { setError(null); load(); }} onError={setError} />
          ))}
        </ul>
      </Card>

      {isAdmin && data.invitations.length > 0 && (
        <Card className="mt-5 overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-[14px] font-semibold text-ink">Invitații în așteptare</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{i.name || i.email}</div>
                  <div className="truncate text-[12px] text-slate-500">{i.name ? `${i.email} · ` : ""}{ROLE_LABELS[i.role]} · expiră {formatDate(i.expiresAt)}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => revoke(i.id, i.email)}>Anulează</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!isAdmin && <p className="mt-4 text-[12px] text-slate-500">Doar administratorii cabinetului pot invita colegi și pot schimba rolurile.</p>}
      <InviteModal open={invite} onClose={() => setInvite(false)} onDone={load} />
    </div>
  );
}
