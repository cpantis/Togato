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

  selfAssessmentLink(p: { to: string; name: string; companyName: string; url: string }) {
    return build(p.to, `Confirmați adresa: autoevaluarea AI Act pentru ${p.companyName}`, [
      `Bună ziua, ${escapeHtml(p.name)}. Autoevaluarea pentru <strong>${escapeHtml(p.companyName)}</strong> a fost salvată.`,
      "Deschideți linkul de mai jos ca să confirmați adresa de email — după confirmare puteți trimite autoevaluarea unui cabinet de avocatură. Cu același link reveniți oricând la autoevaluare.",
      "Păstrați linkul: oricine îl are poate vedea autoevaluarea. Dacă nu ați solicitat-o, ignorați acest mesaj.",
    ], { label: "Confirmă și deschide autoevaluarea", url: p.url }, { footer: "Togato — autoevaluare AI Act gratuită. Rezultatul este orientativ și nu constituie consultanță juridică." });
  },

  selfAssessmentRecovery(p: { to: string; items: { companyName: string; url: string; updatedAt: Date }[] }) {
    return build(p.to, "Linkurile autoevaluărilor AI Act", [
      "Ați cerut din nou linkurile autoevaluărilor făcute cu această adresă de email. Linkurile trimise anterior nu mai funcționează.",
      p.items.map((i) => `• <a href="${escapeHtml(i.url)}">${escapeHtml(i.companyName)}</a> — actualizată ${i.updatedAt.toLocaleDateString("ro-RO")}`).join("<br>"),
      "Dacă nu ați cerut dumneavoastră linkurile, ignorați acest mesaj; autoevaluările rămân accesibile doar prin linkurile de mai sus.",
    ], undefined, { footer: "Togato — autoevaluare AI Act gratuită." });
  },

  referralNew(p: { to: string; companyName: string; contactName: string; tools: number; needsLawyer: boolean; url: string; message?: string | null }) {
    return build(p.to, `Solicitare nouă: ${p.companyName} vă cere asistență pentru AI Act`, [
      `${escapeHtml(p.contactName)} de la <strong>${escapeHtml(p.companyName)}</strong> v-a ales din directorul Togato și vă trimite autoevaluarea firmei (${p.tools} ${p.tools === 1 ? "instrument AI" : "instrumente AI"}).`,
      ...(p.needsLawyer ? ["Autoevaluarea indică cel puțin un instrument cu risc ridicat sau care cere o analiză juridică."] : []),
      ...(p.message ? [`Mesajul firmei: „${escapeHtml(p.message).replace(/\n/g, "<br>")}”`] : []),
      "Dacă acceptați, firma devine client în Togato, cu instrumentele deja introduse, gata de încadrat.",
    ], { label: "Vezi solicitarea", url: p.url });
  },

  referralAnswered(p: { to: string; companyName: string; cabinetName: string; accepted: boolean; message?: string | null; cabinetEmail?: string | null }) {
    return build(p.to, p.accepted ? `${p.cabinetName} a acceptat solicitarea dumneavoastră` : `Răspuns de la ${p.cabinetName}`, [
      p.accepted
        ? `Cabinetul <strong>${escapeHtml(p.cabinetName)}</strong> a acceptat să analizeze conformitatea AI Act pentru ${escapeHtml(p.companyName)} și vă va contacta.`
        : `Cabinetul <strong>${escapeHtml(p.cabinetName)}</strong> nu poate prelua în acest moment solicitarea pentru ${escapeHtml(p.companyName)}. Puteți alege alt cabinet din autoevaluare.`,
      ...(p.message ? [`Mesajul cabinetului: „${escapeHtml(p.message).replace(/\n/g, "<br>")}”`] : []),
      ...(p.accepted && p.cabinetEmail ? [`Contact: ${escapeHtml(p.cabinetEmail)}`] : []),
    ], undefined, { replyTo: p.cabinetEmail ?? undefined });
  },

  breachAlert(p: { to: string; clientName: string; title: string; deadline: Date; reminder: boolean; url: string }) {
    const when = p.deadline.toLocaleString("ro-RO", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" });
    return build(p.to, `${p.reminder ? "Mai sunt 24 de ore" : "Incident de securitate"}: ${p.clientName} — notificare ANSPDCP până la ${when}`, [
      `${p.reminder ? "Reamintire: incidentul" : "A fost înregistrat incidentul"} <strong>„${escapeHtml(p.title)}”</strong> la clientul <strong>${escapeHtml(p.clientName)}</strong>.`,
      `Dacă incidentul prezintă un risc pentru drepturile persoanelor, ANSPDCP trebuie notificată în 72 de ore de la luarea la cunoștință, adică până la <strong>${escapeHtml(when)}</strong> (Art. 33 GDPR). Dacă riscul e evaluat ca neglijabil, documentați motivarea în registru.`,
    ], { label: "Deschide incidentul", url: p.url });
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
