/**
 * Emailurile trimise de Togato: subiect, text simplu și HTML minimal (fără imagini externe,
 * citibil în orice client). Valorile introduse de utilizatori sunt escapate în HTML.
 */
export interface EmailMessage { to: string; subject: string; text: string; html: string; replyTo?: string }

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }, footer?: string, brandColor = "#7a1f3a"): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#334155">${p}</p>`).join("");
  const button = action
    ? `<p style="margin:20px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:${escapeHtml(brandColor)};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 12px;font-size:12px;color:#64748b">Dacă butonul nu merge, copiați linkul: <br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : "";
  return `<!doctype html><html lang="ro"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<h1 style="margin:0 0 16px;font-size:18px;color:#0f172a">${escapeHtml(title)}</h1>${body}${button}
</div>
<p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-align:center">${footer ? escapeHtml(footer) : "Trimis de Togato — conformitate AI Act pentru cabinete de avocatură și consultanță."}</p>
</div></body></html>`;
}

function text(title: string, lines: string[], action?: { label: string; url: string }): string {
  return [title, "", ...lines.map((l) => l.replace(/<[^>]+>/g, "")), ...(action ? ["", `${action.label}: ${action.url}`] : [])].join("\n");
}

function build(to: string, subject: string, paragraphsHtml: string[], action?: { label: string; url: string }, opts: { replyTo?: string; footer?: string; brandColor?: string } = {}): EmailMessage {
  return { to, subject, html: layout(subject, paragraphsHtml, action, opts.footer, opts.brandColor), text: text(subject, paragraphsHtml, action), replyTo: opts.replyTo };
}

export const templates = {
  invitation(p: { to: string; orgName: string; inviterName: string; url: string; expiresDays: number }) {
    return build(p.to, `Invitație în cabinetul ${p.orgName} pe Togato`, [
      `${escapeHtml(p.inviterName)} vă invită să vă alăturați echipei <strong>${escapeHtml(p.orgName)}</strong> pe Togato.`,
      `Linkul este valabil ${p.expiresDays} zile și poate fi folosit o singură dată.`,
    ], { label: "Creează contul", url: p.url });
  },

  passwordReset(p: { to: string; name: string; url: string; expiresMinutes: number }) {
    return build(p.to, "Resetarea parolei Togato", [
      `Bună ziua, ${escapeHtml(p.name)}. Am primit o cerere de resetare a parolei pentru contul dumneavoastră.`,
      `Linkul este valabil ${p.expiresMinutes} de minute. Dacă nu ați cerut resetarea, ignorați acest mesaj — parola rămâne neschimbată.`,
    ], { label: "Setează o parolă nouă", url: p.url });
  },

  passwordChanged(p: { to: string; name: string }) {
    return build(p.to, "Parola Togato a fost schimbată", [
      `Bună ziua, ${escapeHtml(p.name)}. Parola contului dumneavoastră a fost schimbată, iar celelalte sesiuni au fost închise.`,
      "Dacă nu dumneavoastră ați făcut schimbarea, contactați imediat administratorul cabinetului.",
    ]);
  },

  portalLink(p: { to: string; clientName: string; orgName: string; url: string; expiresAt: Date; message?: string | null; replyTo?: string; brandColor?: string | null }) {
    return build(p.to, `${p.orgName}: inventarul instrumentelor AI folosite de ${p.clientName}`, [
      `Cabinetul <strong>${escapeHtml(p.orgName)}</strong> vă roagă să completați lista instrumentelor de inteligență artificială folosite în ${escapeHtml(p.clientName)}, pentru analiza de conformitate cu Regulamentul (UE) 2024/1689 (AI Act).`,
      ...(p.message ? [escapeHtml(p.message).replace(/\n/g, "<br>")] : []),
      `Durează câteva minute pentru fiecare instrument și nu necesită cont. Linkul este valabil până la ${p.expiresAt.toLocaleDateString("ro-RO")}.`,
    ], { label: "Deschide formularul", url: p.url }, { replyTo: p.replyTo, footer: `Trimis prin Togato în numele ${p.orgName}.`, brandColor: p.brandColor ?? undefined });
  },

  portalSubmission(p: { to: string; clientName: string; systemName: string; submittedBy: string; url: string; needsBiometricReview: boolean }) {
    return build(p.to, `${p.clientName} a adăugat „${p.systemName}” în portal`, [
      `${escapeHtml(p.submittedBy)} a trimis un instrument nou prin portalul clientului <strong>${escapeHtml(p.clientName)}</strong>: „${escapeHtml(p.systemName)}”.`,
      "Încadrarea propusă automat așteaptă verificarea dumneavoastră.",
      ...(p.needsBiometricReview ? ["<strong>Atenție:</strong> clientul a indicat prelucrarea de date biometrice — verificați manual încadrarea."] : []),
    ], { label: "Deschide sistemul", url: p.url });
  },

  deadlineDigest(p: { to: string; name: string; items: { client: string; title: string; dueDate: string; overdue: boolean; url: string }[]; dashboardUrl: string }) {
    const list = p.items.slice(0, 25).map((i) => `• ${i.overdue ? "<strong>DEPĂȘIT</strong> " : ""}${escapeHtml(i.dueDate)} — ${escapeHtml(i.client)}: ${escapeHtml(i.title)}`);
    return build(p.to, `Togato: ${p.items.length} termene în următoarele 7 zile`, [
      `Bună ziua, ${escapeHtml(p.name)}. Obligațiile clienților de care răspundeți, cu termen intern apropiat sau depășit:`,
      list.join("<br>"),
      ...(p.items.length > 25 ? [`… și încă ${p.items.length - 25}.`] : []),
    ], { label: "Deschide panoul", url: p.dashboardUrl });
  },
};
